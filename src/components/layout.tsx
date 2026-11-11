import type { Child } from "hono/jsx";
import { statSync } from "node:fs";
import Decimal from "decimal.js";
import { currentPath, lang, t } from "../lib/i18n.js";
import { formatHM } from "../lib/time.js";

// Cache-bust static assets by mtime, computed once at startup (rebuilt assets need a restart).
const ver = (f: string) => { try { return Math.floor(statSync(`public/${f}`).mtimeMs).toString(36); } catch { return "0"; } };
const CSS = `/static/css/app.css?v=${ver("css/app.css")}`;
const HTMX = `/static/js/htmx.min.js?v=${ver("js/htmx.min.js")}`;

export const Layout = ({ title, nav, children }: { title: string; nav?: string; children?: Child }) => (
  <html lang={lang()}>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      {/* Apply a saved theme before first paint; without one, daisyUI follows prefers-color-scheme. */}
      <script dangerouslySetInnerHTML={{ __html: `try{var s=localStorage.getItem("theme");if(s)document.documentElement.dataset.theme=s}catch(e){}` }} />
      <title>{title} — Time Drift</title>
      <link rel="stylesheet" href={CSS} />
      <script src={HTMX} defer />
    </head>
    <body>
      <nav class="navbar relative bg-base-200 px-4 flex-wrap sm:flex-nowrap gap-x-2 gap-y-0" aria-label={t("nav.label")}>
        <a href="/" class="font-bold text-lg flex-1 whitespace-nowrap">Time Drift</a>
        <button type="button" class="btn btn-ghost btn-xs sm:hidden order-2 text-base leading-none" aria-label={t("nav.label")} aria-controls="nav-links" aria-expanded="false"
          onclick="var u=document.getElementById('nav-links');this.setAttribute('aria-expanded',u.classList.toggle('hidden')?'false':'true')"><svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
        <ul id="nav-links" class="hidden sm:flex menu menu-vertical sm:menu-horizontal menu-lg sm:menu-md gap-0 sm:gap-1 absolute sm:static top-full inset-x-0 w-full z-10 bg-base-200 shadow-lg sm:shadow-none sm:w-auto sm:bg-transparent order-3 sm:order-2">
          {[["/", t("nav.dashboard")], ["/month", t("nav.month")], ["/analytics", t("nav.analytics")], ["/history", t("nav.history")]].map(([href, text]) => (
            <li><a href={href} class={nav === href ? "menu-active" : ""} aria-current={nav === href ? "page" : undefined}>{text}</a></li>
          ))}
        </ul>
        <button type="button" class="btn btn-ghost btn-xs order-2 sm:order-3" aria-label={t("theme.toggle")} title={t("theme.toggle")}
          onclick={`var d=document.documentElement,n=(d.dataset.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"))==="dark"?"light":"dark";d.dataset.theme=n;try{localStorage.setItem("theme",n)}catch(e){}`}>◐</button>
        <div class="join order-2 sm:order-3" role="group" aria-label="Language">
          {["de", "en"].map((l) => (
            <a class={`btn btn-xs join-item ${l === lang() ? "btn-primary" : ""}`} href={`/lang/${l}?next=${encodeURIComponent(currentPath())}`} hreflang={l} aria-current={l === lang() ? "true" : undefined}>{l.toUpperCase()}</a>
          ))}
        </div>
      </nav>
      <main class="max-w-4xl mx-auto p-4">{children}</main>
      <div id="flash" class="toast toast-end" role="status" />
      {/* One-shot flash message set by POST handlers; static string, no user input. */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){var m=document.cookie.match(/(?:^|; )flash=([^;]+)/);if(!m)return;document.cookie="flash=; path=/; max-age=0";var f=document.getElementById("flash");f.innerHTML='<div class="alert alert-success"><span></span></div>';f.firstChild.firstChild.textContent=decodeURIComponent(m[1]);setTimeout(function(){f.remove()},3000)})()` }} />
    </body>
  </html>
);

export const SaldoBadge = ({ value }: { value: Decimal | null }) => (
  <span class={`badge badge-sm sm:badge-md ${value?.gt(0) ? "badge-success" : value?.lt(0) ? "badge-error" : "badge-ghost"}`}>
    {value ? formatHM(value, true) : "—"}
  </span>
);

export const ErrorPage = ({ message, back = "/" }: { message: string; back?: string }) => (
  <Layout title={t("err.title")}>
    <div class="alert alert-error" role="alert"><span>{message}</span></div>
    <a class="btn btn-sm mt-4" href={back}>{t("back")}</a>
  </Layout>
);
