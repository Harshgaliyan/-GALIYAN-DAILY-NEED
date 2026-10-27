# GALIYAN DAILY NEED

## Deploy the static website

This is a static website. Deploy the project root to GitHub Pages, Netlify, or another static host; no build command is required. Static hosting serves the pages only and cannot run the Node API.

Checkout and the contact form open WhatsApp with a prefilled message to the store. Customers must review and send the message themselves. A request is not an accepted order until the store confirms item availability, delivery coverage, and the final amount. The cart is kept in the customer's browser and is not cleared automatically.

Delivery is currently limited to Bijnor and nearby areas. The website does not automatically validate serviceability by PIN code; confirm each address manually in WhatsApp. Before advertising, replace "nearby areas" with the exact towns or PIN codes served, verify every listed price and product photo against current stock, and publish the store's actual cancellation, return, and refund policy.

GitHub Pages and static Netlify sites cannot run the Node API. Without a separately deployed Node API, dashboard login, managed products, inventory, and saved order requests will not work online.

Product dashboard:
- Configure `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 12 characters in `.env` before the first server start. Copy `.env.example` as a starting point. There is no default admin password.
- On first start, the server stores a bcrypt password hash in the ignored, non-public `data/.admin.json`; the password is not stored in the browser. Keep `.env` and `data/.admin.json` private and backed up.
- Run `npm start`, then open `http://localhost:3000/admin.html`.
- Deploy this project as a Node.js service on a host that supports a persistent disk. Set the service start command to `npm start`, provide `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` (at least 12 characters), and mount persistent storage. Set `DATA_DIR` and `UPLOAD_DIR` to paths on that persistent disk. The default local paths are suitable for development, not ephemeral production filesystems.
- Set `CORS_ORIGIN` on the API service to the exact public website origin, without the page or repository path. For example, for `https://harshgaliyan.github.io/-GALIYAN-DAILY-NEED/admin.html`, use `https://harshgaliyan.github.io`. Include each origin customers use as a comma-separated entry. Do not use `*`.
- Set `window.GALIYAN_API_BASE_URL` in `api-config.js` to the API service's HTTPS origin, such as `https://your-api.example.com`, then redeploy the static website. Keep the trailing slash off the URL. The API URL is public configuration; never put passwords or other secrets in this file.
- Verify the API deployment by opening `https://your-api.example.com/health` and checking for `{"status":"ok"}`. Then visit the website's `admin.html` and test login and product changes. Both the website and API must use HTTPS in production.
- Admin login issues an in-memory session token that expires after 8 hours. Signing out or restarting the server invalidates the session.
- Product records are stored in `data/products.json`; categories are stored separately in `data/categories.json`. The storefront reads them from `/api/products` and `/api/categories`.
- The dashboard supports product search and category filters, image uploads (JPEG/PNG/WebP, max 5 MB), plus category create, rename, and delete. Categories in use cannot be deleted or renamed until associated products are moved.
- Uploaded images are stored in `UPLOAD_DIR`; products, categories, orders, and the admin password hash are stored in `DATA_DIR`. Back up both directories together. The API server must be able to write to both paths.
- To reset the admin account, stop the server, remove `data/.admin.json`, set new credentials in `.env`, and restart. Removing this file deletes the current admin hash; do not do this unless you can configure a replacement account.

### GitHub Pages + Render setup

This repository includes `render.yaml` as a starting point for the Node API service. In Render, create a Blueprint from the GitHub repository and provide `ADMIN_USERNAME` plus a unique `ADMIN_PASSWORD` of at least 12 characters when prompted. The blueprint configures the GitHub Pages CORS origin and a persistent disk for product, order, admin, and upload data. Persistent disks may require a paid service plan; do not use an ephemeral filesystem for store data.

After Render deploys, copy the service's actual HTTPS origin into `api-config.js` as `window.GALIYAN_API_BASE_URL`, save, and push the change so GitHub Pages redeploys. The Render origin is unique to the service, so it cannot be safely guessed in advance. Check its `/health` endpoint before testing login. The first deployment copies the repository's product and category JSON into the persistent disk; existing product stock values are 0 and must be updated in the dashboard.
