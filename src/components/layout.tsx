import type { Child } from "hono/jsx";
import Decimal from "decimal.js";
import { formatSaldo } from "../lib/time.js";

export const Layout = ({ title, children }: { title: string; children?: Child }) => (
  <html lang="en" data-theme="light">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} — Time Drift</title>
      <link rel="stylesheet" href="/static/css/app.css" />
      <script src="/static/js/htmx.min.js" defer />
    </head>
    <body>
      <nav class="navbar bg-base-200 px-4">
        <a href="/" class="font-bold text-lg flex-1">Time Drift</a>
        <div class="flex gap-4">
          <a href="/">Dashboard</a>
          <a href="/month">Month</a>
          <a href="/analytics">Analytics</a>
          <a href="/history">History</a>
        </div>
      </nav>
      <main class="max-w-4xl mx-auto p-4">{children}</main>
    </body>
  </html>
);

export const SaldoBadge = ({ value }: { value: Decimal | null }) => (
  <span class={`badge ${value?.gt(0) ? "badge-success" : value?.lt(0) ? "badge-error" : "badge-ghost"}`}>
    {value ? formatSaldo(value) : "—"}
  </span>
);
