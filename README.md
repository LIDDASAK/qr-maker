# QR Code Maker

## Static hosting

This app runs on GitHub Pages and other static hosts without Node.js. When
opened outside `http://localhost:8787`, it uses the bundled local QR renderer
and does not require `api-proxy.js`.

Run the proxy only when you want the QR Code Monkey API output and styling:

```powershell
node api-proxy.js
```

The official API cannot be called directly from a static page because its CORS
policy only allows requests from its own website. A deployed proxy or
serverless function is required for that API mode.
