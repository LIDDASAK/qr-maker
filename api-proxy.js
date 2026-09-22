const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT) || 8787;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function serveStatic(request, response) {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, "." + relativePath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type":
      mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  fs.createReadStream(filePath).pipe(response);
}

function proxyQr(request, response) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const upstream = https.request(
      {
        hostname: "api.qrcode-monkey.com",
        path: "/qr/custom",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (upstreamResponse) => {
        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          const content = Buffer.concat(chunks).toString("utf8");
          let output = content;
          if (
            (upstreamResponse.headers["content-type"] || "").includes("json")
          ) {
            const result = JSON.parse(content);
            if (result.imageUrl) {
              result.imageUrl =
                "/api/qr/image?url=" +
                encodeURIComponent(
                  result.imageUrl.startsWith("//")
                    ? "https:" + result.imageUrl
                    : result.imageUrl,
                );
            }
            output = JSON.stringify(result);
          }
          response.writeHead(upstreamResponse.statusCode || 502, {
            "Content-Type":
              upstreamResponse.headers["content-type"] || "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          response.end(output);
        });
      },
    );
    upstream.on("error", (error) => {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    });
    upstream.end(body);
  });
}

function proxyImage(request, response) {
  const imageUrl = new URL(request.url, "http://localhost").searchParams.get(
    "url",
  );
  if (!imageUrl || !/^https:\/\/api\.qrcode-monkey\.com\//.test(imageUrl)) {
    response.writeHead(400);
    response.end("Invalid image URL");
    return;
  }
  https
    .get(imageUrl, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, {
        "Content-Type":
          upstreamResponse.headers["content-type"] || "image/svg+xml",
        "Cache-Control": "no-store",
      });
      upstreamResponse.pipe(response);
    })
    .on("error", (error) => {
      response.writeHead(502);
      response.end(error.message);
    });
}

http
  .createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
      response.end();
      return;
    }
    if (
      request.method === "POST" &&
      new URL(request.url, "http://localhost").pathname === "/api/qr/custom"
    ) {
      proxyQr(request, response);
      return;
    }
    if (
      request.method === "GET" &&
      new URL(request.url, "http://localhost").pathname === "/api/qr/image"
    ) {
      proxyImage(request, response);
      return;
    }
    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }
    response.writeHead(405);
    response.end("Method not allowed");
  })
  .listen(port, () => {
    console.log(`QR project running at http://localhost:${port}`);
  });
