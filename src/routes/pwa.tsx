import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { Layout, VERSION } from "../components/layout.js";
import { t } from "../lib/i18n.js";

export const pwaRoutes = new Hono();

const icon = (sizes: string, src: string, purpose: string) => ({ src: `/static/icons/${src}`, sizes, type: "image/png", purpose });

// Fetched with credentials (crossorigin=use-credentials), but the proxy should serve it publicly for installability checks.
pwaRoutes.get("/manifest.webmanifest", (c) => {
  c.header("Content-Type", "application/manifest+json");
  return c.body(JSON.stringify({
    id: "/", name: "Time Drift", short_name: "Time Drift", start_url: "/", scope: "/", display: "standalone",
    theme_color: "#2563eb", background_color: "#ffffff",
    icons: [icon("192x192", "icon-192.png", "any"), icon("512x512", "icon-512.png", "any"), icon("512x512", "icon-512.png", "maskable")],
    shortcuts: [
      { name: t("day.addBlock"), url: "/day/today" },
      { name: t("nav.month"), url: "/month" },
      { name: t("nav.analytics"), url: "/analytics" },
      { name: t("nav.history"), url: "/history" },
    ].map((s) => ({ ...s, icons: [icon("192x192", "icon-192.png", "any")] })),
  }));
});

// Served from / (not /static) so its scope covers the whole app; no-cache so updates are picked up.
pwaRoutes.get("/sw.js", (c) => {
  c.header("Content-Type", "text/javascript");
  c.header("Cache-Control", "no-cache");
  return c.body(readFileSync("public/sw.js", "utf8").replace("__V__", VERSION));
});

pwaRoutes.get("/offline", (c) => c.html(
  <Layout title={t("offline.title")}>
    <div class="alert alert-warning" role="alert"><span>{t("offline.text")}</span></div>
    <a class="btn btn-md mt-4" href="/">{t("offline.retry")}</a>
  </Layout>,
));
