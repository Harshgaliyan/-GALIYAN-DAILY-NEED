require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit').rateLimit;
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
const productsFile = path.join(dataDir, 'products.json');
const categoriesFile = path.join(dataDir, 'categories.json');
const ordersFile = path.join(dataDir, '.orders.json');
const adminFile = path.join(dataDir, '.admin.json');
const legacyAdminFile = path.join(dataDir, 'admin.json');
const uploadDir = path.join(__dirname, 'uploads');
const sessions = new Map();
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const DEFAULT_CATEGORIES = [
    { id: 'atta', name: 'Atta & Grain' },
    { id: 'rice', name: 'Rice & Staples' },
    { id: 'snacks', name: 'Biscuits & Snacks' },
    { id: 'chocolate', name: 'Chocolates & Sweets' },
    { id: 'dairy', name: 'Dairy Products' },
    { id: 'beverages', name: 'Tea & Beverages' },
    { id: 'spices', name: 'Spices & Masala' },
    { id: 'oils', name: 'Cooking Oils' }
];

const isValidStock = (stock) => (
    (typeof stock === 'number' || (typeof stock === 'string' && stock.trim() !== '')) &&
    Number.isSafeInteger(Number(stock)) &&
    Number(stock) >= 0
);

const readProducts = () => {
    const parsed = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Product data must be a JSON array.');
    return parsed.map((product) => ({
        ...product,
        stock: isValidStock(product.stock)
            ? Number(product.stock)
            : 0
    }));
};

const writeProducts = (products) => {
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
    return products;
};

const readCategories = () => {
    const parsed = JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Category data must be a JSON array.');
    return parsed;
};

const writeCategories = (categories) => {
    fs.writeFileSync(categoriesFile, JSON.stringify(categories, null, 2));
    return categories;
};

const readOrders = () => {
    const parsed = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Order data must be a JSON array.');
    return parsed;
};

const writeOrders = (orders) => {
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
    return orders;
};

const initialiseData = async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });

    if (!fs.existsSync(productsFile)) writeProducts([]);
    if (!fs.existsSync(categoriesFile)) writeCategories(DEFAULT_CATEGORIES);
    if (!fs.existsSync(ordersFile)) writeOrders([]);

    const storedProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    if (storedProducts.some((product) => !isValidStock(product.stock))) {
        writeProducts(storedProducts.map((product) => ({
            ...product,
            stock: isValidStock(product.stock)
                ? Number(product.stock)
                : 0
        })));
    }

    if (!fs.existsSync(adminFile) && fs.existsSync(legacyAdminFile)) {
        fs.renameSync(legacyAdminFile, adminFile);
    }

    if (!fs.existsSync(adminFile)) {
        const username = String(process.env.ADMIN_USERNAME || '').trim();
        const password = String(process.env.ADMIN_PASSWORD || '');
        if (!username || password.length < 12) {
            throw new Error('First-time setup requires ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters in .env.');
        }
        const passwordHash = await bcrypt.hash(password, 12);
        fs.writeFileSync(adminFile, JSON.stringify({ username, passwordHash }, null, 2), { mode: 0o600 });
        console.log(`Initial admin account "${username}" created with a bcrypt password hash.`);
    }
};

const normaliseProduct = (product) => ({
    id: Number(product.id) || Date.now(),
    title: String(product.title || product.name || 'Untitled product').trim(),
    name: String(product.name || product.title || 'Untitled product').trim(),
    price: Number(product.price),
    stock: isValidStock(product.stock) ? Number(product.stock) : 0,
    image: String(product.image || '').trim(),
    category: String(product.category || 'general').trim(),
    brand: String(product.brand || 'generic').trim(),
    meta: String(product.meta || '').trim(),
    description: String(product.description || '').trim(),
    range: String(product.range || '').trim(),
    icon: String(product.icon || 'fas fa-shopping-basket').trim(),
    active: product.active === false ? false : true
});

const requireAdmin = (request, response, next) => {
    const token = String(request.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const expiresAt = sessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
        sessions.delete(token);
        return response.status(401).json({ error: 'Admin session expired. Please log in again.' });
    }

    return next();
};

app.use(express.json({ limit: '10kb' }));
app.use(express.static(__dirname));

const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (request, file, callback) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            return callback(new Error('Choose a JPEG, PNG, or WebP image.'));
        }
        return callback(null, true);
    }
});

const imageTypes = [
    { mime: 'image/jpeg', extension: 'jpg', signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    { mime: 'image/png', extension: 'png', signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: 'image/webp', extension: 'webp', signature: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
];

const removeManagedImage = (imageUrl) => {
    const match = /^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(String(imageUrl || ''));
    if (!match) return;
    const imagePath = path.join(uploadDir, match[1]);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
};

const makeCategoryId = (name) => name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

const isValidProductImage = (image) => {
    if (typeof image !== 'string' || image.length > 2048) return false;
    if (/^\/uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(image)) {
        return fs.existsSync(path.join(uploadDir, path.basename(image)));
    }
    try {
        const url = new URL(image);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch (error) {
        return false;
    }
};

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

const orderRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
const ORDER_STATUSES = ['requested', 'confirmed', 'completed', 'cancelled'];

app.post('/api/contact', contactLimiter, async (request, response) => {
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body
        : {};
    const name = cleanText(body.name);
    const email = cleanText(body.email);
    const phone = cleanText(body.phone);
    const message = cleanText(body.message);
    const website = cleanText(body.website);

    if (website) return response.status(400).json({ error: 'Unable to submit this message.' });
    if (!name || name.length > 100 || !isValidEmail(email) || email.length > 254 ||
        phone.length > 30 || !message || message.length > 3000) {
        return response.status(400).json({ error: 'Please check the form fields and try again.' });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const sender = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPassword || !sender ||
        !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        return response.status(503).json({ error: 'Contact email is not configured yet. Please call +91 9897312151.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPassword }
        });
        await transporter.sendMail({
            from: sender,
            to: 'harshchaudhary20003@gmail.com',
            replyTo: email,
            subject: 'Website contact request',
            text: [
                `Name: ${name}`,
                `Email: ${email}`,
                `Phone: ${phone || 'Not provided'}`,
                '',
                'Message:',
                message
            ].join('\n')
        });
        return response.json({ success: true });
    } catch (error) {
        console.error('Contact email delivery failed:', error.message);
        return response.status(502).json({ error: 'We could not send your message right now. Please try again later.' });
    }
});

const adminLoginLimiter = rateLimit({
   windowMs: 15 * 60 * 1000,
   limit: 10,
   standardHeaders: 'draft-7',
   legacyHeaders: false
});

app.post('/api/admin/login', adminLoginLimiter, async (request, response) => {
   const body = request.body && typeof request.body === 'object' ? request.body : {};
   const username = String(body.username || '').trim();
   const password = String(body.password || '');
   const admin = JSON.parse(fs.readFileSync(adminFile, 'utf8'));

   if (username !== admin.username || !(await bcrypt.compare(password, admin.passwordHash))) {
       return response.status(401).json({ error: 'Invalid admin credentials.' });
   }

   for (const [sessionToken, expiresAt] of sessions) {
       if (expiresAt <= Date.now()) sessions.delete(sessionToken);
   }
   const token = crypto.randomBytes(32).toString('hex');
   sessions.set(token, Date.now() + SESSION_LIFETIME_MS);
   return response.json({ success: true, username, token });
});

app.post('/api/admin/logout', requireAdmin, (request, response) => {
   const token = String(request.get('authorization') || '').replace(/^Bearer\s+/i, '');
   sessions.delete(token);
   return response.json({ success: true });
});

app.get('/api/products', (request, response) => {
   const products = readProducts();
   return response.json(products.filter((product) => product.active !== false));
});

app.get('/api/categories', (request, response) => {
   return response.json(readCategories());
});

app.post('/api/orders', orderRequestLimiter, (request, response) => {
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body
        : {};
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const name = cleanText(customer.name);
    const phone = cleanText(customer.phone);
    const email = cleanText(customer.email);
    const address = cleanText(customer.address);
    const city = cleanText(customer.city);
    const state = cleanText(customer.state);
    const pincode = cleanText(customer.pincode);
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name || name.length > 100 || !/^[+()\d\s-]{7,20}$/.test(phone) ||
        phoneDigits.length < 7 || phoneDigits.length > 15 ||
        (email && (!isValidEmail(email) || email.length > 254)) ||
        !address || address.length > 500 || !city || city.length > 100 ||
        !state || state.length > 100 || !/^[1-9]\d{5}$/.test(pincode) ||
        !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
        return response.status(400).json({ error: 'Please check the delivery details and order items, then try again.' });
    }

    const products = readProducts();
    const items = [];
    for (const requestedItem of body.items) {
        if (!requestedItem || typeof requestedItem !== 'object' || Array.isArray(requestedItem)) {
            return response.status(400).json({ error: 'One or more order items are invalid.' });
        }
        const productId = Number(requestedItem.productId);
        const quantity = Number(requestedItem.quantity);
        const product = products.find((item) => Number(item.id) === productId && item.active !== false);
        if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
            return response.status(400).json({ error: 'One or more products in your cart are no longer available. Refresh the store and try again.' });
        }
        if (quantity > product.stock) {
            return response.status(409).json({ error: `${product.name || product.title} has only ${product.stock} in stock. Update your cart or contact the store.` });
        }
        const existing = items.find((item) => item.productId === productId);
        if (existing) {
            existing.quantity += quantity;
            existing.lineTotal = existing.quantity * existing.price;
            if (existing.quantity > product.stock || existing.quantity > 99) {
                return response.status(409).json({ error: `${product.name || product.title} does not have enough stock for this order.` });
            }
        } else {
            items.push({
                productId,
                name: product.name || product.title,
                price: Number(product.price),
                quantity,
                lineTotal: quantity * Number(product.price)
            });
        }
    }

    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
    const delivery = subtotal >= 500 ? 0 : 39;
    const order = {
        id: `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        createdAt: new Date().toISOString(),
        customer: { name, phone, email, address, city, state, pincode },
        items,
        subtotal,
        delivery,
        total: subtotal + delivery,
        status: 'requested'
    };
    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);
    return response.status(201).json({
        id: order.id,
        subtotal: order.subtotal,
        delivery: order.delivery,
        total: order.total,
        status: order.status,
        items: order.items
    });
});

app.get('/api/admin/orders', requireAdmin, (request, response) => {
    return response.json(readOrders().slice().reverse());
});

app.put('/api/admin/orders/:id/status', requireAdmin, (request, response) => {
    const orders = readOrders();
    const order = orders.find((item) => item.id === request.params.id);
    if (!order) return response.status(404).json({ error: 'Order not found.' });

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const nextStatus = String(body.status || '');
    if (!ORDER_STATUSES.includes(nextStatus)) {
        return response.status(400).json({ error: 'Choose a valid order status.' });
    }
    if (nextStatus === order.status) return response.json(order);

    const products = readProducts();
    if (nextStatus === 'confirmed') {
        if (order.status !== 'requested') {
            return response.status(409).json({ error: 'Only requested orders can be confirmed.' });
        }
        for (const item of order.items) {
            const product = products.find((entry) => Number(entry.id) === Number(item.productId));
            if (!product || product.stock < item.quantity) {
                return response.status(409).json({ error: `${item.name} no longer has enough stock to confirm this order.` });
            }
        }
        for (const item of order.items) {
            const product = products.find((entry) => Number(entry.id) === Number(item.productId));
            product.stock -= item.quantity;
        }
        writeProducts(products);
    } else if (nextStatus === 'cancelled' && order.status === 'confirmed') {
        for (const item of order.items) {
            const product = products.find((entry) => Number(entry.id) === Number(item.productId));
            if (product) product.stock += item.quantity;
        }
        writeProducts(products);
    } else if (nextStatus === 'completed') {
        if (order.status !== 'confirmed') {
            return response.status(409).json({ error: 'Only confirmed orders can be completed.' });
        }
    } else if (nextStatus === 'cancelled') {
        if (order.status !== 'requested') {
            return response.status(409).json({ error: 'This order cannot be cancelled from its current status.' });
        }
    } else {
        return response.status(409).json({ error: 'This order cannot move to the selected status.' });
    }

    order.status = nextStatus;
    writeOrders(orders);
    return response.json(order);
});

app.get('/api/admin/reports/sales', requireAdmin, (request, response) => {
    const orders = readOrders();
    const completedOrders = orders.filter((order) => order.status === 'completed');
    return response.json({
        orderCount: orders.length,
        requestedCount: orders.filter((order) => order.status === 'requested').length,
        completedCount: completedOrders.length,
        completedSales: completedOrders.reduce((total, order) => total + Number(order.total || 0), 0)
    });
});

app.get('/api/admin/products', requireAdmin, (request, response) => {
   const products = readProducts();
   return response.json(products);
});

app.post('/api/admin/uploads', requireAdmin, imageUpload.single('image'), (request, response) => {
   if (!request.file) return response.status(400).json({ error: 'Choose an image to upload.' });

   const imageType = imageTypes.find((type) => type.mime === request.file.mimetype && type.signature(request.file.buffer));
   if (!imageType) return response.status(400).json({ error: 'The selected file is not a valid supported image.' });

   const filename = `${crypto.randomBytes(16).toString('hex')}.${imageType.extension}`;
   fs.writeFileSync(path.join(uploadDir, filename), request.file.buffer, { flag: 'wx' });
   return response.status(201).json({ image: `/uploads/${filename}` });
});

app.get('/api/admin/categories', requireAdmin, (request, response) => {
   return response.json(readCategories());
});

app.post('/api/admin/categories', requireAdmin, (request, response) => {
   const body = request.body && typeof request.body === 'object' ? request.body : {};
   const name = String(body.name || '').trim();
   const id = makeCategoryId(name);
   if (!name || name.length > 60 || !id) return response.status(400).json({ error: 'Enter a category name up to 60 characters.' });

   const categories = readCategories();
   if (categories.some((category) => category.id === id)) {
       return response.status(409).json({ error: 'A category with that name already exists.' });
   }

   const category = { id, name };
   categories.push(category);
   writeCategories(categories);
   return response.status(201).json(category);
});

app.put('/api/admin/categories/:id', requireAdmin, (request, response) => {
   const categories = readCategories();
   const index = categories.findIndex((category) => category.id === request.params.id);
   if (index === -1) return response.status(404).json({ error: 'Category not found.' });

   const body = request.body && typeof request.body === 'object' ? request.body : {};
   const name = String(body.name || '').trim();
   const id = makeCategoryId(name);
   if (!name || name.length > 60 || !id) return response.status(400).json({ error: 'Enter a category name up to 60 characters.' });
   if (categories.some((category) => category.id === id && category.id !== request.params.id)) {
       return response.status(409).json({ error: 'A category with that name already exists.' });
   }
   if (id !== request.params.id && readProducts().some((product) => product.category === request.params.id)) {
       return response.status(409).json({ error: 'This category is used by products. Move those products before renaming it.' });
   }

   categories[index] = { id, name };
   writeCategories(categories);
   return response.json(categories[index]);
});

app.delete('/api/admin/categories/:id', requireAdmin, (request, response) => {
   const categories = readCategories();
   const category = categories.find((item) => item.id === request.params.id);
   if (!category) return response.status(404).json({ error: 'Category not found.' });
   if (readProducts().some((product) => product.category === category.id)) {
       return response.status(409).json({ error: 'This category is used by products. Move or delete those products first.' });
   }

   writeCategories(categories.filter((item) => item.id !== category.id));
   return response.json({ success: true });
});

app.post('/api/admin/products', requireAdmin, (request, response) => {
   const body = request.body && typeof request.body === 'object' ? request.body : {};
   const products = readProducts();
   const title = String(body.title || body.name || '').trim();
   const product = normaliseProduct({
       ...body,
       id: products.reduce((nextId, item) => Math.max(nextId, Number(item.id) || 0), 0) + 1,
       title,
       name: title
   });

   if (!title || product.title.length > 120 || !Number.isFinite(product.price) || product.price <= 0 ||
       !isValidStock(body.stock) ||
       !readCategories().some((category) => category.id === product.category) || !isValidProductImage(product.image)) {
       return response.status(400).json({ error: 'Enter a valid title, positive price, non-negative whole-number stock, image, and existing category.' });
   }

    products.push(product);
    writeProducts(products);
    return response.status(201).json(product);
});

app.put('/api/admin/products/:id', requireAdmin, (request, response) => {
    const products = readProducts();
    const id = Number(request.params.id);
    const index = products.findIndex((product) => Number(product.id) === id);

    if (index === -1) {
        return response.status(404).json({ error: 'Product not found.' });
    }

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const title = String(body.title || body.name || products[index].title || '').trim();
    const stock = Object.prototype.hasOwnProperty.call(body, 'stock') ? body.stock : products[index].stock;
    const updatedProduct = normaliseProduct({
        ...products[index],
        ...body,
        id,
        title,
        name: title,
        stock
    });
    if (!title || updatedProduct.title.length > 120 ||
        !Number.isFinite(updatedProduct.price) || updatedProduct.price <= 0 ||
        !isValidStock(stock) ||
        !readCategories().some((category) => category.id === updatedProduct.category) ||
        !isValidProductImage(updatedProduct.image)) {
        return response.status(400).json({ error: 'Enter a valid title, positive price, non-negative whole-number stock, image, and existing category.' });
    }

    const previousImage = products[index].image;
    products[index] = updatedProduct;
    writeProducts(products);
    if (previousImage !== updatedProduct.image) removeManagedImage(previousImage);
    return response.json(updatedProduct);
});

app.delete('/api/admin/products/:id', requireAdmin, (request, response) => {
    const products = readProducts();
    const id = Number(request.params.id);
    const filtered = products.filter((product) => Number(product.id) !== id);

    if (filtered.length === products.length) {
        return response.status(404).json({ error: 'Product not found.' });
    }

    const deletedProduct = products.find((product) => Number(product.id) === id);
    writeProducts(filtered);
    removeManagedImage(deletedProduct.image);
    return response.json({ success: true });
});

app.get('/health', (request, response) => response.json({ status: 'ok' }));

app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Image files must be 5 MB or smaller.'
            : 'Unable to process this image upload.';
        return response.status(400).json({ error: message });
    }
    if (error.message === 'Choose a JPEG, PNG, or WebP image.') {
        return response.status(400).json({ error: error.message });
    }
    console.error('Request failed:', error.message);
    return response.status(500).json({ error: 'The server could not complete this request.' });
});

initialiseData().then(() => {
    app.listen(port, () => {
        console.log(`GALIYAN site server listening on port ${port}`);
    });
}).catch((error) => {
    console.error(`Server setup failed: ${error.message}`);
    process.exitCode = 1;
});
