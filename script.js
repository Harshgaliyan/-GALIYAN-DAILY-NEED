document.addEventListener('DOMContentLoaded', () => {
    const CART_KEY = 'galiyan-cart';
    const FREE_DELIVERY_THRESHOLD = 500;
    const DELIVERY_FEE = 39;

    const getDeliveryFee = (subtotal) => (
        subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : subtotal > 0 ? DELIVERY_FEE : 0
    );

    const getCart = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(saved) ? saved : [];
        } catch (error) {
            return [];
        }
    };

    const saveCart = (cart) => {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    };

    const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);

    const updateCartBadge = () => {
        const cartCount = document.querySelector('#cartCount');
        if (!cartCount) return;

        const total = getCart().reduce((sum, item) => sum + Number(item.qty || 0), 0);
        cartCount.textContent = total;
    };

    const addToCart = (name, price, qty = 1, image = '') => {
        const cart = getCart();
        const found = cart.find((item) => item.name === name);

        if (found) {
            found.qty += qty;
            found.image = image || found.image;
        } else {
            cart.push({ name, price, qty, image });
        }

        saveCart(cart);
        updateCartBadge();

        if (document.body.dataset.page === 'cart') {
            renderCartPage();
        }
    };

    const renderCartPage = () => {
        const cartList = document.querySelector('.cart-list');
        const subtotalEl = document.querySelector('[data-subtotal]');
        const deliveryEl = document.querySelector('[data-delivery]');
        const deliveryMessageEl = document.querySelector('[data-delivery-message]');
        const totalEl = document.querySelector('[data-total]');

        if (!cartList) return;

        const cart = getCart();
        if (!cart.length) {
            cartList.innerHTML = '<div class="empty-state">Your cart is currently empty.</div>';
            if (subtotalEl) subtotalEl.textContent = '₹0';
            if (deliveryEl) deliveryEl.textContent = '₹0';
            if (deliveryMessageEl) deliveryMessageEl.textContent = 'Free delivery on orders of ₹500 or more.';
            if (totalEl) totalEl.textContent = '₹0';
            return;
        }

        const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
        const delivery = getDeliveryFee(subtotal);
        const total = subtotal + delivery;

        cartList.innerHTML = cart.map((item) => `
            <div class="cart-item">
                <div class="product-image-small">
                    ${item.image
                        ? `<img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><i class="fas fa-shopping-basket" style="display:none;"></i>`
                        : '<i class="fas fa-shopping-basket" aria-hidden="true"></i>'}
                </div>
                <div>
                    <h3>${escapeHTML(item.name)}</h3>
                    <div class="meta">₹${Number(item.price)} each</div>
                    <div class="qty-controls">
                        <button type="button" aria-label="Remove one ${escapeHTML(item.name)}" data-action="decrease" data-name="${escapeHTML(item.name)}">-</button>
                        <span>${Number(item.qty)}</span>
                        <button type="button" aria-label="Add one ${escapeHTML(item.name)}" data-action="increase" data-name="${escapeHTML(item.name)}">+</button>
                    </div>
                </div>
                <div class="price">₹${Number(item.price) * Number(item.qty)}</div>
            </div>
        `).join('');

        if (subtotalEl) subtotalEl.textContent = `₹${subtotal}`;
        if (deliveryEl) deliveryEl.textContent = delivery === 0 ? 'Free' : `₹${delivery}`;
        if (deliveryMessageEl) {
            deliveryMessageEl.textContent = delivery === 0
                ? 'Free delivery applied!'
                : `Add ₹${FREE_DELIVERY_THRESHOLD - subtotal} more for free delivery.`;
        }
        if (totalEl) totalEl.textContent = `₹${total}`;

        cartList.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                const name = button.dataset.name;
                const updatedCart = getCart().map((item) => {
                    if (item.name !== name) return item;
                    return {
                        ...item,
                        qty: action === 'increase' ? item.qty + 1 : item.qty - 1
                    };
                }).filter((item) => item.qty > 0);

                saveCart(updatedCart);
                renderCartPage();
                updateCartBadge();
            });
        });
    };

    const getUserName = () => {
        try {
            const user = JSON.parse(localStorage.getItem('galiyan-user') || 'null');
            return user && user.name ? user.name : '';
        } catch (error) {
            return '';
        }
    };

    const openLoginModal = (afterLoginAction = null) => {
        const modal = document.getElementById('loginModal');
        if (!modal) return;
        window.galiyanPendingAction = afterLoginAction || null;
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const field = document.getElementById('loginName');
        if (field) field.focus();
    };

    const closeLoginModal = () => {
        const modal = document.getElementById('loginModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
    };

    const handleCheckout = () => {
        const cart = getCart();
        if (!cart.length) {
            alert('Your cart is empty. Add products before checkout.');
            return;
        }

        const deliveryDetails = window.GaliyanDelivery.getDetails();
        if (!deliveryDetails) {
            alert('Please save a valid Indian delivery address before placing your order.');
            const deliveryForm = document.querySelector('#cartDeliveryForm');
            if (deliveryForm) {
                deliveryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                const firstField = deliveryForm.querySelector('input');
                if (firstField) firstField.focus({ preventScroll: true });
            }
            return;
        }

        const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
        const delivery = getDeliveryFee(subtotal);
        const estimatedTotal = subtotal + delivery;
        const items = cart.map((item, index) =>
            `${index + 1}. ${item.name} × ${Number(item.qty)} — ₹${Number(item.price) * Number(item.qty)}`
        ).join('\n');
        const address = [
            deliveryDetails.address,
            deliveryDetails.city,
            deliveryDetails.state,
            deliveryDetails.pincode
        ].filter(Boolean).join(', ');
        const message = [
            'Hello GALIYAN DAILY NEED! I would like to request this order.',
            '',
            'Items:',
            items,
            '',
            `Subtotal: ₹${subtotal}`,
            `Delivery: ${delivery === 0 ? 'Free' : `₹${delivery}`}`,
            `Estimated total: ₹${estimatedTotal}`,
            'Payment preference: Cash on Delivery (please confirm)',
            '',
            `Name: ${deliveryDetails.name}`,
            `Phone: ${deliveryDetails.phone}`,
            deliveryDetails.email ? `Email: ${deliveryDetails.email}` : '',
            `Delivery address: ${address}`,
            '',
            'Please confirm item availability, delivery coverage, and the final amount. This is an order request, not a confirmed order. The store will confirm it in WhatsApp.'
        ].filter(Boolean).join('\n');

        window.location.href = `https://wa.me/919897312151?text=${encodeURIComponent(message)}`;
    };

    document.querySelectorAll('[data-add-cart]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const name = button.dataset.name || 'Product';
            const price = Number(button.dataset.price || 0);

            addToCart(name, price, 1);

            const originalText = button.dataset.label || 'Add to Cart';
            button.textContent = 'Added';
            button.classList.add('added');
            button.disabled = true;

            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('added');
                button.disabled = false;
            }, 900);
        });
    });

    const navToggle = document.querySelector('#navToggle');
    const navMenu = document.querySelector('#navMenu');

    if (navToggle && navMenu) {
        navToggle.setAttribute('aria-expanded', 'false');
        const currentPage = window.location.pathname.split('/').pop().toLowerCase();
        navMenu.querySelectorAll('a').forEach((link) => {
            const linkPage = new URL(link.href, window.location.href).pathname.split('/').pop().toLowerCase();
            if (linkPage === currentPage) {
                link.setAttribute('aria-current', 'page');
            }
        });

        navToggle.addEventListener('click', () => {
            const isOpen = navMenu.classList.toggle('is-open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
            navToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
        });

        navMenu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('is-open');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.setAttribute('aria-label', 'Open navigation menu');
            });
        });
    }

    const searchInputs = document.querySelectorAll('.search-box input');
    searchInputs.forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            const query = input.value.trim();
            if (!query) {
                window.location.href = 'products.html';
                return;
            }
            window.location.href = `products.html?search=${encodeURIComponent(query)}`;
        });
    });

    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.addEventListener('click', (event) => {
            if (event.target === loginModal) closeLoginModal();
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const field = document.getElementById('loginName');
            const value = field ? field.value.trim() : '';
            if (!value) {
                alert('Please enter your name to continue.');
                return;
            }
            localStorage.setItem('galiyan-user', JSON.stringify({ name: value }));
            closeLoginModal();
            alert('Welcome, ' + value + '!');

            const pendingAction = window.galiyanPendingAction;
            if (pendingAction) {
                window.galiyanPendingAction = null;
                if (pendingAction.type === 'checkout') {
                    handleCheckout();
                } else if (pendingAction.type === 'add' && typeof window.addToCart === 'function') {
                    window.addToCart(pendingAction.name, pendingAction.price, pendingAction.image);
                }
            }
        });
    }

    document.querySelectorAll('.checkout-button, .checkout-btn').forEach((button) => {
        button.addEventListener('click', () => {
            if (!getCart().length) {
                alert('Your cart is empty. Add products before checkout.');
                return;
            }
            if (!window.GaliyanDelivery.getDetails()) {
                alert('Please save your delivery address before checkout.');
                const deliveryForm = document.querySelector('#cartDeliveryForm');
                if (deliveryForm) {
                    deliveryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    const firstField = deliveryForm.querySelector('input');
                    if (firstField) firstField.focus({ preventScroll: true });
                }
                return;
            }

            handleCheckout();
        });
    });

    const deliveryForm = document.querySelector('#cartDeliveryForm');
    if (deliveryForm) {
        deliveryForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(deliveryForm);
            const details = Object.fromEntries(formData.entries());
            for (const key of Object.keys(details)) {
                details[key] = details[key].trim();
            }

            try {
                window.GaliyanDelivery.saveDetails(details);
            } catch (error) {
                console.error('Could not save delivery details.', error);
                alert(error.message || 'Unable to save delivery details. Please try again.');
                return;
            }

            window.GaliyanDelivery.updateLocationLabels();
            alert('Delivery address saved successfully.');
        });
    }

    document.querySelectorAll('.cart-button, .cart-icon').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = 'cart.html';
        });
    });

    updateCartBadge();
    if (document.body.dataset.page === 'cart') {
        renderCartPage();
    }
});
