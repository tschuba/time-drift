import type { Child } from "hono/jsx";
import { readFileSync, statSync } from "node:fs";
import Decimal from "decimal.js";
import { Ico } from "./icons.js";
import { currentPath, lang, t } from "../lib/i18n.js";
import { formatHM } from "../lib/time.js";

// Cache-bust static assets by mtime, computed once at startup (rebuilt assets need a restart).
const ver = (f: string) => { try { return Math.floor(statSync(`public/${f}`).mtimeMs).toString(36); } catch { return "0"; } };
const CSS = `/static/css/app.css?v=${ver("css/app.css")}`;
const HTMX = `/static/js/htmx.min.js?v=${ver("js/htmx.min.js")}`;

// Read from package.json at startup (cwd-relative, like public/ above); release-please keeps it current.
export const VERSION: string = (() => { try { return JSON.parse(readFileSync("package.json", "utf8")).version; } catch { return "dev"; } })();

export const Layout = ({ title, nav, children }: { title: string; nav?: string; children?: Child }) => (
  <html lang={lang()}>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      {/* Apply a saved theme before first paint; without one, daisyUI follows prefers-color-scheme. */}
      <script dangerouslySetInnerHTML={{ __html: `try{var s=localStorage.getItem("theme");if(s)document.documentElement.dataset.theme=s}catch(e){}addEventListener("DOMContentLoaded",function(){var s="";try{s=localStorage.getItem("theme")||""}catch(e){}document.querySelectorAll("input[name=theme]").forEach(function(r){r.checked=r.value===s;r.onchange=function(){var d=document.documentElement;if(r.value)d.dataset.theme=r.value;else delete d.dataset.theme;try{r.value?localStorage.setItem("theme",r.value):localStorage.removeItem("theme")}catch(e){}document.getElementById("theme-pop").hidePopover()}})})` }} />
      <link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />
      <meta name="theme-color" content="#2563eb" />
      <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png" />
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
        <div class="order-2 sm:order-3">
          <button type="button" id="theme-btn" popovertarget="theme-pop" style="anchor-name:--theme" class="btn btn-ghost btn-sm" aria-label={t("settings.label")} title={t("settings.label")}>
            <Ico c="icon-[tabler--adjustments-horizontal]" />
          </button>
          <div id="theme-pop" popover="auto" style="position-anchor:--theme" class="dropdown dropdown-end mt-1 p-3 bg-base-200 border border-base-300 rounded-box shadow-lg w-64 max-w-[calc(100vw-1rem)] flex-col gap-3">
            <div class="text-xs font-semibold uppercase tracking-wide opacity-60">{t("theme.label")}</div>
            <div class="join w-full" role="radiogroup" aria-label={t("theme.label")}>
              {([["light", t("theme.light"), "icon-[tabler--sun]"], ["", t("theme.auto"), "icon-[tabler--device-desktop]"], ["dark", t("theme.dark"), "icon-[tabler--moon]"]]).map(([v, l, ic]) => (
                <label class="btn h-auto min-h-11 py-1.5 flex-1 flex-col gap-0.5 text-xs font-normal join-item has-checked:btn-primary" title={l}>
                  <input type="radio" name="theme" value={v} class="sr-only" aria-label={l} />
                  <Ico c={ic} />
                  {l}
                </label>
              ))}
            </div>
            <div class="divider my-0" />
            <div class="text-xs font-semibold uppercase tracking-wide opacity-60">{t("lang.label")}</div>
            <div class="join w-full" role="group" aria-label={t("lang.label")}>
              {[["de", "Deutsch"], ["en", "English"]].map(([l, n]) => (
                <a class={`btn btn-md join-item flex-1 ${l === lang() ? "btn-primary" : ""}`} href={`/lang/${l}?next=${encodeURIComponent(currentPath())}`} hreflang={l} aria-current={l === lang() ? "true" : undefined}>{n}</a>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main class="max-w-4xl mx-auto p-4">{children}</main>
      <footer class="text-center text-xs opacity-60 p-4">
        © {new Date().getFullYear()} <a class="link" target="_blank" rel="noopener noreferrer" href="https://github.com/tschuba">tschuba</a> · <a class="link" target="_blank" rel="noopener noreferrer" href="https://github.com/tschuba/time-drift/blob/main/LICENSE">AGPL-3.0</a> ·{" "}
        <a class="link" target="_blank" rel="noopener noreferrer" href={`https://github.com/tschuba/time-drift/releases/tag/v${VERSION}`}>v{VERSION}</a>
      </footer>
      <div id="flash" class="toast toast-end" role="status" />
      {/* PWA: service worker; an expired Authentik session makes htmx requests fail cross-origin, so reload to reach the login. */}
      <script dangerouslySetInnerHTML={{ __html: `if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js");addEventListener("htmx:sendError",function(){location.reload()})` }} />
      {/* One-shot flash message set by POST handlers; static string, no user input. */}
      {/* Running blocks: reload each minute unless the user has typed something. */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){var d=0;addEventListener("input",function(){d=1});var run=document.querySelector("[data-running]");if(navigator.setAppBadge&&(run||document.getElementById("block-editor")))(run?navigator.setAppBadge():navigator.clearAppBadge()).catch(function(){});if(run)setInterval(function(){if(!d&&!document.hidden)location.reload()},60000)})()` }} />
      {/* htmx drops 4xx bodies by default; show them as an error toast (textContent, so no injection). */}
      <script dangerouslySetInnerHTML={{ __html: `addEventListener("htmx:beforeSwap",function(e){var x=e.detail.xhr;if(x.status<400||x.status>=500)return;e.detail.shouldSwap=false;var f=document.getElementById("flash");if(!f)return;f.innerHTML='<div class="alert alert-error"><span></span></div>';f.firstChild.firstChild.textContent=x.responseText;clearTimeout(f._t);f._t=setTimeout(function(){f.innerHTML=""},4000)})` }} />
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
    <a class="btn btn-md mt-4" href={back}>{t("back")}</a>
  </Layout>
);
