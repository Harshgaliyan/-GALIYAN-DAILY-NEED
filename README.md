# GALIYAN DAILY NEED

## Deploy to Netlify

This is a static website. Deploy the project root as the publish directory; no build command is required.

Checkout and the contact form open WhatsApp with a prefilled message to the store. Customers must review and send the message themselves. A request is not an accepted order until the store confirms item availability, delivery coverage, and the final amount. The cart is kept in the customer's browser and is not cleared automatically.

Delivery is currently limited to Bijnor and nearby areas. The website does not automatically validate serviceability by PIN code; confirm each address manually in WhatsApp. Before advertising, replace "nearby areas" with the exact towns or PIN codes served, verify every listed price and product photo against current stock, and publish the store's actual cancellation, return, and refund policy.

The optional Node.js server (`npm start`) provides an SMTP contact API for deployments that use it; the static Netlify site does not run this server or require SMTP settings for WhatsApp contact and order requests.

Product dashboard:
- Configure `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 12 characters in `.env` before the first server start. Copy `.env.example` as a starting point. There is no default admin password.
- On first start, the server stores a bcrypt password hash in the ignored, non-public `data/.admin.json`; the password is not stored in the browser. Keep `.env` and `data/.admin.json` private and backed up.
- Run `npm start`, then open `http://localhost:3000/admin.html`.
- Admin login issues an in-memory session token that expires after 8 hours. Signing out or restarting the server invalidates the session.
- Product records are stored in `data/products.json`; categories are stored separately in `data/categories.json`. The storefront reads them from `/api/products` and `/api/categories`.
- The dashboard supports product search and category filters, image uploads (JPEG/PNG/WebP, max 5 MB), plus category create, rename, and delete. Categories in use cannot be deleted or renamed until associated products are moved.
- Uploaded images are stored in `uploads/`. Back up the data files and upload directory together. Production hosting must run the Node server and provide persistent disk storage; a static-only Netlify deploy cannot serve the admin API or retain uploads.
- To reset the admin account, stop the server, remove `data/.admin.json`, set new credentials in `.env`, and restart. Removing this file deletes the current admin hash; do not do this unless you can configure a replacement account.
