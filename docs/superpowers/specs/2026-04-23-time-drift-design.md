# Time Drift — Design Spec

**Date:** 2026-04-23
**Status:** Draft

## Overview

Time Drift is a personal working-hours tracker that replaces an Excel spreadsheet ("SAP Zeitkonto") used since April 2022. It tracks daily clock-in/clock-out times, break durations, target hours, and a running over/underhours saldo.

The app is a single-user web application deployed as a Docker Compose service on a Raspberry Pi via Coolify, with Authentik handling authentication externally.

## Goals

- Replace the Excel-based time tracking with a web UI accessible from any device
- Import ~4 years of existing data (~733 entries, ~135 multi-session days)
- Maintain the running saldo (currently +18.32h)
- Mobile-friendly, fast, minimal resource usage on Raspberry Pi
- Zero-maintenance once deployed

## Non-Goals

- Multi-user support or built-in authentication (Authentik handles this)
- Task/project allocation planning (the "Zeitplanung" sheet is out of scope)
- Mobile native app

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend | Rust + Axum | High performance, tiny binary, minimal RAM |
| Templates | Askama | Compile-time checked, type-safe HTML templates |
| Interactivity | HTMX | Dynamic partial updates without JS framework |
| Database | PostgreSQL 16 | Reliable, good time/date support, runs well on ARM |
| ORM/Queries | sqlx | Compile-time checked SQL, async, no heavy ORM overhead |
| CI/CD | GitHub Actions | Build multi-arch Docker images, push to GHCR |
| Deployment | Coolify + Docker Compose | Single service, Traefik reverse proxy, Authentik auth |

## Data Model

### `time_entries` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Unique entry ID |
| `date` | DATE | NOT NULL, UNIQUE | Work date (one entry per day) |
| `target_hours` | DECIMAL(4,2) | NOT NULL | Expected hours (8.0 weekday, 0.0 weekend, overridable) |
| `note` | TEXT | NULLABLE | Optional remark |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last modification timestamp |

### `time_blocks` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Unique block ID |
| `entry_id` | UUID | FK → time_entries(id) ON DELETE CASCADE | Parent day entry |
| `start_time` | TIME | NOT NULL | Clock-in time |
| `end_time` | TIME | NULLABLE | Clock-out time (NULL = currently running) |
| `break_hours` | DECIMAL(4,2) | NOT NULL, DEFAULT 0 | Break duration deducted from this block |
| `sort_order` | SMALLINT | NOT NULL, DEFAULT 0 | Ordering of blocks within a day |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last modification timestamp |

### Indexes

- `time_entries(date)` — UNIQUE, primary lookup pattern
- `time_blocks(entry_id)` — FK lookups
- `time_entries(date DESC)` — for history pagination

### Derived Values (computed, never stored)

- **Actual hours per block:** `(end_time - start_time) in hours - break_hours`
- **Actual hours per day:** sum of all blocks for that entry
- **Daily saldo:** `actual_hours - target_hours`
- **Running total saldo:** sum of all daily saldos across all entries

## Pages & UI

### 1. Dashboard (`/`)

The landing page and primary view.

- **Saldo badge:** Current running total, prominently displayed (green if positive, red if negative)
- **Today's entry:** Shows today's time blocks if they exist, or a "Start your day" quick-action
- **Quick clock-in/clock-out:** Single button to start or stop a time block
- **Last 7 days:** Summary table with date, actual hours, target, daily saldo

### 2. Monthly View (`/month/{YYYY-MM}`)

The workhorse view, closest to the Excel experience.

- **Month navigation:** Previous/next month buttons, month/year header
- **Day rows:** One row per day showing:
  - Date (with weekday name)
  - Time blocks (start–end, break) displayed compactly
  - Actual hours
  - Target hours
  - Daily saldo (color-coded)
- **Monthly subtotal:** Sum of actual, target, and saldo for the month
- **Inline editing:** Click a day row to expand/edit via HTMX partial swap
- **Visual indicators:** Weekends and days with 0h target shown in a muted style

### 3. Day Entry Editor (`/day/{YYYY-MM-DD}`)

Create or edit a single day's entry.

- **Date:** Pre-filled, displayed as header
- **Target hours:** Auto-filled (8 for weekday, 0 for weekend), editable
- **Time blocks:** List of start/end/break rows
  - Add block button (HTMX appends a new row)
  - Remove block button per row
  - Accepts time input as `8:30`, `08:30`
- **Note:** Optional text field
- **Computed display:** Shows actual hours and daily saldo in real-time as you edit (HTMX recalculation on blur)
- **Save:** Persists all changes
- **Delete:** Remove the entire day entry (with confirmation)

### 4. Analytics (`/analytics`)

Visual insights into working patterns, rendered entirely as server-side SVG — no JavaScript charting libraries.

- **Saldo trend chart:** Line chart showing cumulative saldo over time. Filterable by range (last 3 months, 6 months, 1 year, all time). X-axis = weeks or months, Y-axis = running saldo in hours.
- **Weekly/monthly hours bar chart:** Grouped bar chart comparing actual vs target hours per week or month. Clearly shows over/underwork periods.
- **Summary statistics:** Key numbers displayed as cards:
  - Average actual hours per workday
  - Average daily saldo
  - Total overtime / undertime this month / this year
  - Busiest weekday (by average hours)
  - Overtime frequency (% of days where actual > target)
- **Work intensity heatmap:** GitHub-style contribution calendar. Each day is a cell, color intensity represents hours worked. Full year view with week columns.
- **Period comparisons:** Side-by-side comparison of two months or two quarters. Shows hours worked, saldo, average per day for each period.

All charts are generated as inline SVG in Askama templates, computed from query results in the Rust service layer. No client-side rendering.

### 5. History View (`/history`)

Paginated list of all entries.

- **Newest first** by default
- **Date range filter:** From/to date inputs
- **Columns:** Date, actual hours, target hours, daily saldo, running saldo, note
- **Pagination:** 50 entries per page

### UX Principles

- **Mobile-first responsive design** — works well on phone screens
- **Minimal clicks** — logging a standard workday: open → enter times → save
- **No JavaScript build toolchain** — HTMX loaded from a static file, all interactivity via HTML attributes
- **Tolerant time input** — accept `8:30`, `08:30`, `0830` formats
- **Color-coded saldo** — green for positive, red for negative, at a glance

## Project Structure

```
time-drift/
├── Cargo.toml
├── Dockerfile
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── build.yml          # GitHub Actions: test + build + push to GHCR
├── migrations/
│   └── 20260423000000_initial.sql
├── templates/
│   ├── base.html              # Layout with nav, HTMX script, CSS
│   ├── dashboard.html
│   ├── month.html
│   ├── day_form.html
│   ├── analytics.html
│   ├── history.html
│   └── partials/
│       ├── time_block_row.html
│       ├── day_summary_row.html
│       └── saldo_badge.html
├── static/
│   ├── htmx.min.js
│   └── style.css
├── src/
│   ├── main.rs                # Axum app setup, router, server start
│   ├── config.rs              # Environment-based configuration
│   ├── db.rs                  # sqlx PgPool setup, migration runner
│   ├── models.rs              # TimeEntry, TimeBlock structs + query helpers
│   ├── routes/
│   │   ├── mod.rs             # Router composition
│   │   ├── dashboard.rs       # GET /
│   │   ├── month.rs           # GET /month/{YYYY-MM}
│   │   ├── day.rs             # GET/POST/DELETE /day/{YYYY-MM-DD}
│   │   ├── analytics.rs       # GET /analytics
│   │   └── history.rs         # GET /history
│   └── services/
│       ├── time.rs            # Business logic: saldo calculation, target hours defaults
│       └── charts.rs          # SVG chart generation: trend lines, bar charts, heatmap
├── tests/
│   └── integration/           # Integration tests with test database
└── tools/
    ├── import_excel.py        # Excel → SQL import script (Python + openpyxl)
    └── requirements.txt       # openpyxl dependency
```

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/build.yml`)

**Trigger:** Push to `main` branch

**Jobs:**

1. **Test**
   - Start PostgreSQL service container
   - `cargo clippy -- -D warnings`
   - `cargo test` (unit + integration tests)

2. **Build & Push**
   - Depends on: test job passing
   - Multi-arch build: `linux/amd64` + `linux/arm64` via `docker/build-push-action` + QEMU
   - Push to `ghcr.io/<user>/time-drift:latest` and `ghcr.io/<user>/time-drift:sha-<commit>`

### Dockerfile

Multi-stage build:

```dockerfile
# Stage 1: Build
FROM rust:bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Stage 2: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/time-drift /usr/local/bin/
COPY --from=builder /app/static /app/static
COPY --from=builder /app/migrations /app/migrations
WORKDIR /app
EXPOSE 80
CMD ["time-drift"]
```

Note: Askama templates are compiled into the binary at build time — no need to copy the `templates/` directory. The `static/` directory is served at runtime by `tower-http::ServeDir` and must be present alongside the binary. The `migrations/` directory is needed for sqlx to run migrations at app startup.

### Docker Compose (`docker-compose.yml`)

```yaml
services:
  app:
    image: ghcr.io/<user>/time-drift:latest
    ports:
      - "80:80"
    environment:
      - DATABASE_URL=postgres://timedrift:${DB_PASSWORD}@db:5432/timedrift
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=timedrift
      - POSTGRES_USER=timedrift
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U timedrift"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Coolify deploys this as a single Docker Compose service. `DB_PASSWORD` is configured as a Coolify environment variable. Traefik routes the subdomain to port 80. Authentik provides forward-auth.

## Data Import

### Strategy

A one-time Python script (`tools/import_excel.py`) converts the Excel file to SQL:

1. Read all rows from the "Zeitkonto" sheet
2. Group multi-session rows (rows without a date) with their parent date row
3. Generate SQL INSERT statements for `time_entries` and `time_blocks`
4. Output a `.sql` file that can be piped into PostgreSQL

### Multi-session grouping logic

- Row has a date → new `time_entries` record
- Row has no date but has start/end times → additional `time_blocks` row attached to the most recent dated entry

### Import execution

Run once after initial deployment:

```bash
python3 tools/import_excel.py /path/to/excel.xlsx > import.sql
psql $DATABASE_URL < import.sql
```

## Target Hours Auto-Detection

When creating a new entry, the default target hours are:

- **Monday–Friday:** 8.0 hours
- **Saturday–Sunday:** 0.0 hours

The user can override this per day (e.g., set to 4.0 for a half-day, or 0.0 for vacation/sick leave).

Future consideration: German public holidays could be auto-detected, but this is out of scope for v1. The user manually sets 0h for holidays — same as the current Excel workflow.

## Error Handling

- **Database errors:** Displayed as user-friendly error messages in the UI
- **Invalid time input:** Client-side HTML5 time inputs + server-side validation; rejected with inline error
- **Overlapping time blocks:** Warn but allow (the user might have legitimate reasons)
- **Missing end time:** Allowed — represents a currently running session

## SVG Chart Rendering

All charts are rendered server-side as inline SVG embedded in Askama templates. The approach:

- **`services/charts.rs`** contains pure functions that take query result data and produce SVG string fragments (paths, rects, text elements, etc.)
- **Coordinate math** is done in Rust: scale data points to a viewBox, compute axis ticks, position labels
- **Styling** via CSS classes in the SVG, themed consistently with the rest of the app
- **Responsiveness** via `viewBox` + `preserveAspectRatio` — SVGs scale naturally to container width
- **No external crate needed** — SVG is just string templating; Askama handles it. If the math gets complex, the `svg` crate could be introduced, but plain string generation is preferred for simplicity
- **HTMX integration** — chart filter controls (date range, period selector) trigger HTMX requests that swap the chart SVG partial, keeping the page feel interactive without full reloads
