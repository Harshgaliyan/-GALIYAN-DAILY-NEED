(() => {
    const configuredBase = String(window.GALIYAN_API_BASE_URL || '').trim();
    let apiOrigin = window.location.origin;

    if (configuredBase) {
        let configuredUrl;
        try {
            configuredUrl = new URL(configuredBase);
        } catch (error) {
            throw new Error('The API server URL in api-config.js is invalid. Enter the full URL of your deployed API server.');
        }
        if (!['http:', 'https:'].includes(configuredUrl.protocol) ||
            configuredUrl.username || configuredUrl.password || configuredUrl.search || configuredUrl.hash ||
            (configuredUrl.pathname !== '/' && configuredUrl.pathname !== '')) {
            throw new Error('The API server URL in api-config.js must be an http or https origin, such as https://api.example.com.');
        }
        apiOrigin = configuredUrl.origin;
    }

    const nativeFetch = window.fetch.bind(window);

    window.GaliyanApi = Object.freeze({
        async fetch(input, options) {
            const requestUrl = new URL(input, window.location.href);
            if (requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/')) {
                requestUrl.href = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin).href;
            }

            let response;
            try {
                response = await nativeFetch(requestUrl.href, options);
            } catch (error) {
                if (error instanceof TypeError) {
                    throw new Error(`Could not connect to the store API at ${apiOrigin}. Check api-config.js, make sure the Node API server is online, and allow this website's origin in the server's CORS_ORIGIN setting.`);
                }
                throw error;
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.toLowerCase().includes('application/json')) {
                const detail = response.status === 404 || contentType.toLowerCase().includes('text/html')
                    ? 'The website host returned an HTML page instead of the API. Deploy server.js as a Node service and set api-config.js to that service URL.'
                    : `The API returned an unexpected response (${response.status}).`;
                throw new Error(detail);
            }

            try {
                await response.clone().json();
            } catch (error) {
                throw new Error('The store API returned invalid JSON. Check the API service logs and try again.');
            }
            return response;
        }
    });
})();
