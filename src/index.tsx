import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "./lib/logger.js";

export const app = new Hono();
app.use("/static/*", serveStatic({ root: "./public", rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));
app.get("/health", (c) => c.text("ok"));
app.get("/", (c) =>
  c.html(
    <html data-theme="light">
      <head>
        <title>time-drift</title>
        <link rel="stylesheet" href="/static/css/app.css" />
        <script src="/static/js/htmx.min.js" />
      </head>
      <body class="p-8">
        <h1 class="text-2xl font-bold">time-drift</h1>
      </body>
    </html>,
  ),
);

if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 80);
  serve({ fetch: app.fetch, port }, () => logger.info({ port }, "listening"));
}
