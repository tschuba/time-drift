import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db/index.js";
import { dayRoutes } from "./routes/day.js";
import { monthRoutes } from "./routes/month.js";
import { logger } from "./lib/logger.js";

export const app = new Hono();
app.use("/static/*", serveStatic({ root: "./public", rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));
app.get("/health", (c) => c.text("ok"));
app.get("/", (c) => c.redirect("/month"));
app.route("/", dayRoutes);
app.route("/", monthRoutes);

if (process.env.VITEST === undefined) {
  await migrate(db, { migrationsFolder: "drizzle" });
  const port = Number(process.env.PORT ?? 80);
  serve({ fetch: app.fetch, port }, () => logger.info({ port }, "listening"));
}
