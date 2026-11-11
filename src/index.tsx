import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db/index.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { dayRoutes } from "./routes/day.js";
import { historyRoutes } from "./routes/history.js";
import { monthRoutes } from "./routes/month.js";
import { i18n, langRoutes } from "./lib/i18n.js";
import { logger } from "./lib/logger.js";

export const app = new Hono();
app.use("*", i18n);
app.use("/static/*", serveStatic({ root: "./public", rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));
app.get("/health", (c) => c.text("ok"));
app.route("/", langRoutes);
app.route("/", dashboardRoutes);
app.route("/", dayRoutes);
app.route("/", historyRoutes);
app.route("/", analyticsRoutes);
app.route("/", monthRoutes);

if (process.env.VITEST === undefined) {
  await migrate(db, { migrationsFolder: "drizzle" });
  const port = Number(process.env.PORT ?? 80);
  serve({ fetch: app.fetch, port }, () => logger.info({ port }, "listening"));
}
