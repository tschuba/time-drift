import { describe, expect, it } from "vitest";
import { pickLang } from "./i18n.js";

describe("pickLang", () => {
  it("picks supported languages by q-order, regions ignored", () => {
    expect(pickLang("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(pickLang("fr;q=0.9,en;q=0.5,de;q=0.4")).toBe("en");
    expect(pickLang("en;q=0.3,de;q=0.9")).toBe("de");
  });
  it("falls back to English", () => {
    expect(pickLang(undefined)).toBe("en");
    expect(pickLang("fr-FR,es;q=0.8")).toBe("en");
    expect(pickLang("de;q=0")).toBe("en");
    expect(pickLang("*")).toBe("en");
  });
});

import { Hono } from "hono";
import { i18n, langRoutes, t } from "./i18n.js";

describe("language switcher", () => {
  const app = new Hono().use("*", i18n).route("/", langRoutes).get("/x", (c) => c.text(t("save")));
  it("cookie beats Accept-Language", async () => {
    expect(await (await app.request("/x", { headers: { "accept-language": "en", cookie: "lang=de" } })).text()).toBe("Speichern");
    expect(await (await app.request("/x", { headers: { "accept-language": "de" } })).text()).toBe("Speichern");
    expect(await (await app.request("/x", { headers: { "accept-language": "de", cookie: "lang=xx" } })).text()).toBe("Speichern");
  });
  it("sets cookie and only redirects to same-site paths", async () => {
    const ok = await app.request("/lang/de?next=%2Fmonth%3Fa%3D1");
    expect([ok.status, ok.headers.get("location"), ok.headers.get("set-cookie")]).toEqual([303, "/month?a=1", expect.stringContaining("lang=de")]);
    expect((await app.request("/lang/en?next=%2F%2Fevil.com")).headers.get("location")).toBe("/");
    expect((await app.request("/lang/fr")).status).toBe(400);
  });
});
