# Time Drift Implementation Plan — Part 1: Foundation & Core Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal working-hours tracker web app in Rust that replaces an Excel-based time tracking spreadsheet.

**Architecture:** Single Rust binary (Axum) serving server-rendered HTML (Askama templates) with HTMX for interactivity. PostgreSQL for storage. Docker Compose for deployment on a Raspberry Pi via Coolify.

**Tech Stack:** Rust, Axum, Askama, HTMX, sqlx, PostgreSQL 16, Docker, GitHub Actions

**Full spec:** `docs/superpowers/specs/2026-04-23-time-drift-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `Cargo.toml` | Project manifest with all dependencies |
| `src/main.rs` | Axum app setup, router composition, server start |
| `src/config.rs` | Environment-based configuration (DATABASE_URL, port) |
| `src/db.rs` | sqlx PgPool setup, migration runner |
| `src/models.rs` | TimeEntry, TimeBlock structs, DB query functions |
| `src/services/mod.rs` | Service module declarations |
| `src/services/time.rs` | Business logic: saldo calculation, target hours defaults, time parsing |
| `src/services/charts.rs` | SVG chart generation (Part 2) |
| `src/routes/mod.rs` | Router composition, shared state type |
| `src/routes/dashboard.rs` | GET / — landing page with saldo badge, today's entry, last 7 days |
| `src/routes/day.rs` | GET/POST/DELETE /day/{date} — day entry editor, HTMX partials |
| `src/routes/month.rs` | GET /month/{YYYY-MM} — monthly view |
| `src/routes/history.rs` | GET /history — paginated history (Part 2) |
| `src/routes/analytics.rs` | GET /analytics — charts & stats (Part 2) |
| `migrations/20260423000000_initial.sql` | Database schema |
| `templates/base.html` | HTML layout shell with nav, HTMX, CSS link |
| `templates/dashboard.html` | Dashboard page template |
| `templates/month.html` | Monthly view template |
| `templates/day_form.html` | Day entry editor template |
| `templates/history.html` | History view template (Part 2) |
| `templates/analytics.html` | Analytics page template (Part 2) |
| `templates/partials/time_block_row.html` | Single time block form row (HTMX fragment) |
| `templates/partials/day_summary_row.html` | Day row in monthly view (HTMX fragment) |
| `templates/partials/saldo_badge.html` | Saldo display badge (HTMX fragment) |
| `static/htmx.min.js` | HTMX library (vendored) |
| `static/style.css` | Application CSS (mobile-first) |
| `tests/service_tests.rs` | Unit tests for time service business logic |
| `tools/import_excel.py` | Excel to SQL import script (Part 2) |
| `tools/requirements.txt` | Python dependencies for import (Part 2) |
| `Dockerfile` | Multi-stage build (Part 2) |
| `docker-compose.yml` | App + PostgreSQL (Part 2) |
| `.github/workflows/build.yml` | CI/CD pipeline (Part 2) |

---

### Task 1: Project Scaffold & Dependencies

**Files:**
- Create: `Cargo.toml`
- Create: `src/main.rs`
- Create: `src/config.rs`
- Create: `src/db.rs`
- Create: `.gitignore`

- [ ] **Step 1: Initialize Cargo project**

Run:
```bash
cd /Users/I557775/Projects/non-sap/time-drift
cargo init --name time-drift
```

Expected: Creates `Cargo.toml` and `src/main.rs`

- [ ] **Step 2: Create .gitignore**

Write `.gitignore`:

```gitignore
/target
.env
*.swp
*.swo
.DS_Store
```

- [ ] **Step 3: Set up Cargo.toml with all dependencies**

Replace `Cargo.toml` with:

```toml
[package]
name = "time-drift"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "uuid", "chrono", "rust_decimal", "migrate"] }
askama = "0.13"
askama_axum = "0.5"
serde = { version = "1", features = ["derive"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = { version = "1", features = ["serde-with-str"] }
tower-http = { version = "0.6", features = ["fs", "compression-gzip"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
```

- [ ] **Step 4: Write src/config.rs**

```rust
use std::env;

pub struct Config {
    pub database_url: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://timedrift:timedrift@localhost:5432/timedrift".into()),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(80),
        }
    }
}
```

- [ ] **Step 5: Write src/db.rs**

```rust
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await
        .expect("Failed to connect to database")
}

pub async fn run_migrations(pool: &PgPool) {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .expect("Failed to run database migrations");
}
```

- [ ] **Step 6: Write src/main.rs — minimal Axum server**

```rust
mod config;
mod db;

use axum::{routing::get, Router};
use std::net::SocketAddr;
use tower_http::services::ServeDir;

async fn health() -> &'static str {
    "OK"
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "time_drift=info".into()),
        )
        .init();

    let config = config::Config::from_env();
    let pool = db::create_pool(&config.database_url).await;
    db::run_migrations(&pool).await;

    let app = Router::new()
        .route("/health", get(health))
        .nest_service("/static", ServeDir::new("static"))
        .with_state(pool);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 7: Verify it compiles**

Run:
```bash
cargo check
```

Expected: Compilation succeeds (will warn about unused imports, that's fine — no migrations dir yet).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Rust project with Axum, sqlx, and config"
```

---

### Task 2: Database Migration

**Files:**
- Create: `migrations/20260423000000_initial.sql`

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p migrations
```

- [ ] **Step 2: Write the initial migration**

Create `migrations/20260423000000_initial.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    target_hours DECIMAL(4,2) NOT NULL DEFAULT 8.0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE time_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
    start_time TIME NOT NULL,
    end_time TIME,
    break_hours DECIMAL(4,2) NOT NULL DEFAULT 0,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_blocks_entry_id ON time_blocks(entry_id);
CREATE INDEX idx_time_entries_date_desc ON time_entries(date DESC);

-- Trigger to auto-update updated_at on time_entries
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_time_entries_updated_at
    BEFORE UPDATE ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_blocks_updated_at
    BEFORE UPDATE ON time_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 3: Verify project still compiles**

```bash
cargo check
```

Expected: Compiles. The `sqlx::migrate!` macro will now find the migrations directory.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add initial database migration for time_entries and time_blocks"
```

---

### Task 3: Models & Query Functions

**Files:**
- Create: `src/models.rs`
- Modify: `src/main.rs` (add `mod models`)

- [ ] **Step 1: Write src/models.rs**

```rust
use chrono::{NaiveDate, NaiveTime};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct TimeEntry {
    pub id: Uuid,
    pub date: NaiveDate,
    pub target_hours: Decimal,
    pub note: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct TimeBlock {
    pub id: Uuid,
    pub entry_id: Uuid,
    pub start_time: NaiveTime,
    pub end_time: Option<NaiveTime>,
    pub break_hours: Decimal,
    pub sort_order: i16,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// A day entry with its associated time blocks, used for display.
#[derive(Debug, Clone)]
pub struct DayWithBlocks {
    pub entry: TimeEntry,
    pub blocks: Vec<TimeBlock>,
}

/// Form input for creating/updating a day entry.
#[derive(Debug, Deserialize)]
pub struct DayFormInput {
    pub target_hours: Decimal,
    pub note: Option<String>,
    pub starts: Vec<String>,
    pub ends: Vec<String>,
    pub breaks: Vec<String>,
}

// --- Query functions ---

pub async fn get_entry_by_date(pool: &PgPool, date: NaiveDate) -> sqlx::Result<Option<TimeEntry>> {
    sqlx::query_as::<_, TimeEntry>("SELECT * FROM time_entries WHERE date = $1")
        .bind(date)
        .fetch_optional(pool)
        .await
}

pub async fn get_blocks_for_entry(pool: &PgPool, entry_id: Uuid) -> sqlx::Result<Vec<TimeBlock>> {
    sqlx::query_as::<_, TimeBlock>(
        "SELECT * FROM time_blocks WHERE entry_id = $1 ORDER BY sort_order, start_time",
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await
}

pub async fn get_day_with_blocks(
    pool: &PgPool,
    date: NaiveDate,
) -> sqlx::Result<Option<DayWithBlocks>> {
    let entry = get_entry_by_date(pool, date).await?;
    match entry {
        Some(entry) => {
            let blocks = get_blocks_for_entry(pool, entry.id).await?;
            Ok(Some(DayWithBlocks { entry, blocks }))
        }
        None => Ok(None),
    }
}

pub async fn get_entries_for_date_range(
    pool: &PgPool,
    from: NaiveDate,
    to: NaiveDate,
) -> sqlx::Result<Vec<DayWithBlocks>> {
    let entries = sqlx::query_as::<_, TimeEntry>(
        "SELECT * FROM time_entries WHERE date >= $1 AND date <= $2 ORDER BY date",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let entry_ids: Vec<Uuid> = entries.iter().map(|e| e.id).collect();

    let blocks = if entry_ids.is_empty() {
        vec![]
    } else {
        sqlx::query_as::<_, TimeBlock>(
            "SELECT * FROM time_blocks WHERE entry_id = ANY($1) ORDER BY entry_id, sort_order, start_time",
        )
        .bind(&entry_ids)
        .fetch_all(pool)
        .await?
    };

    let mut result: Vec<DayWithBlocks> = entries
        .into_iter()
        .map(|entry| DayWithBlocks {
            entry,
            blocks: vec![],
        })
        .collect();

    for block in blocks {
        if let Some(day) = result.iter_mut().find(|d| d.entry.id == block.entry_id) {
            day.blocks.push(block);
        }
    }

    Ok(result)
}

pub async fn upsert_entry(
    pool: &PgPool,
    date: NaiveDate,
    target_hours: Decimal,
    note: Option<String>,
) -> sqlx::Result<TimeEntry> {
    sqlx::query_as::<_, TimeEntry>(
        r#"INSERT INTO time_entries (date, target_hours, note)
           VALUES ($1, $2, $3)
           ON CONFLICT (date) DO UPDATE SET target_hours = $2, note = $3
           RETURNING *"#,
    )
    .bind(date)
    .bind(target_hours)
    .bind(note)
    .fetch_one(pool)
    .await
}

pub async fn delete_blocks_for_entry(pool: &PgPool, entry_id: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM time_blocks WHERE entry_id = $1")
        .bind(entry_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert_block(
    pool: &PgPool,
    entry_id: Uuid,
    start_time: NaiveTime,
    end_time: Option<NaiveTime>,
    break_hours: Decimal,
    sort_order: i16,
) -> sqlx::Result<TimeBlock> {
    sqlx::query_as::<_, TimeBlock>(
        r#"INSERT INTO time_blocks (entry_id, start_time, end_time, break_hours, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
    )
    .bind(entry_id)
    .bind(start_time)
    .bind(end_time)
    .bind(break_hours)
    .bind(sort_order)
    .fetch_one(pool)
    .await
}

pub async fn delete_entry(pool: &PgPool, date: NaiveDate) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM time_entries WHERE date = $1")
        .bind(date)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_total_saldo(pool: &PgPool) -> sqlx::Result<Decimal> {
    let row: (Decimal,) = sqlx::query_as(
        r#"SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0) as saldo
        FROM time_entries e"#,
    )
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

pub async fn get_entries_paginated(
    pool: &PgPool,
    offset: i64,
    limit: i64,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> sqlx::Result<(Vec<DayWithBlocks>, i64)> {
    let count_row: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM time_entries
           WHERE ($1::date IS NULL OR date >= $1)
           AND ($2::date IS NULL OR date <= $2)"#,
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;

    let entries = sqlx::query_as::<_, TimeEntry>(
        r#"SELECT * FROM time_entries
           WHERE ($1::date IS NULL OR date >= $1)
           AND ($2::date IS NULL OR date <= $2)
           ORDER BY date DESC
           LIMIT $3 OFFSET $4"#,
    )
    .bind(from)
    .bind(to)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let entry_ids: Vec<Uuid> = entries.iter().map(|e| e.id).collect();
    let blocks = if entry_ids.is_empty() {
        vec![]
    } else {
        sqlx::query_as::<_, TimeBlock>(
            "SELECT * FROM time_blocks WHERE entry_id = ANY($1) ORDER BY entry_id, sort_order, start_time",
        )
        .bind(&entry_ids)
        .fetch_all(pool)
        .await?
    };

    let mut result: Vec<DayWithBlocks> = entries
        .into_iter()
        .map(|entry| DayWithBlocks {
            entry,
            blocks: vec![],
        })
        .collect();

    for block in blocks {
        if let Some(day) = result.iter_mut().find(|d| d.entry.id == block.entry_id) {
            day.blocks.push(block);
        }
    }

    Ok((result, count_row.0))
}
```

- [ ] **Step 2: Add mod declaration to main.rs**

Add `mod models;` to the top of `src/main.rs`, after the existing mod declarations:

```rust
mod config;
mod db;
mod models;
```

- [ ] **Step 3: Verify it compiles**

```bash
cargo check
```

Expected: Compiles with possible warnings about unused functions (expected — routes will use them).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add models and database query functions"
```

---

### Task 4: Time Service — Business Logic with Unit Tests

**Files:**
- Create: `src/services/mod.rs`
- Create: `src/services/time.rs`
- Create: `tests/service_tests.rs`
- Modify: `src/main.rs` (add `mod services`)

- [ ] **Step 1: Create service module structure**

Create `src/services/mod.rs`:

```rust
pub mod time;
```

Add `mod services;` to `src/main.rs`:

```rust
mod config;
mod db;
mod models;
mod services;
```

- [ ] **Step 2: Write failing tests for time service**

Create `tests/service_tests.rs`:

```rust
use chrono::NaiveTime;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

// We'll test the pure business logic functions from services::time

#[test]
fn test_block_actual_hours_normal() {
    let start = NaiveTime::from_hms_opt(8, 30, 0).unwrap();
    let end = Some(NaiveTime::from_hms_opt(17, 30, 0).unwrap());
    let break_hours = dec!(1.0);
    let result = time_drift::services::time::block_actual_hours(start, end, break_hours);
    assert_eq!(result, Some(dec!(8.0)));
}

#[test]
fn test_block_actual_hours_no_end() {
    let start = NaiveTime::from_hms_opt(8, 30, 0).unwrap();
    let end = None;
    let break_hours = dec!(0);
    let result = time_drift::services::time::block_actual_hours(start, end, break_hours);
    assert_eq!(result, None);
}

#[test]
fn test_block_actual_hours_zero_break() {
    let start = NaiveTime::from_hms_opt(9, 0, 0).unwrap();
    let end = Some(NaiveTime::from_hms_opt(12, 0, 0).unwrap());
    let break_hours = dec!(0);
    let result = time_drift::services::time::block_actual_hours(start, end, break_hours);
    assert_eq!(result, Some(dec!(3.0)));
}

#[test]
fn test_block_actual_hours_fractional() {
    let start = NaiveTime::from_hms_opt(8, 30, 0).unwrap();
    let end = Some(NaiveTime::from_hms_opt(17, 45, 0).unwrap());
    let break_hours = dec!(0.5);
    let result = time_drift::services::time::block_actual_hours(start, end, break_hours);
    // 9h15m = 9.25, minus 0.5 break = 8.75
    assert_eq!(result, Some(dec!(8.75)));
}

#[test]
fn test_day_actual_hours_multiple_blocks() {
    let blocks = vec![
        (
            NaiveTime::from_hms_opt(8, 30, 0).unwrap(),
            Some(NaiveTime::from_hms_opt(17, 30, 0).unwrap()),
            dec!(1.0),
        ),
        (
            NaiveTime::from_hms_opt(20, 0, 0).unwrap(),
            Some(NaiveTime::from_hms_opt(22, 30, 0).unwrap()),
            dec!(0),
        ),
    ];
    let result = time_drift::services::time::day_actual_hours(&blocks);
    // 8.0 + 2.5 = 10.5
    assert_eq!(result, Some(dec!(10.5)));
}

#[test]
fn test_day_actual_hours_with_open_block() {
    let blocks = vec![
        (
            NaiveTime::from_hms_opt(8, 30, 0).unwrap(),
            Some(NaiveTime::from_hms_opt(12, 0, 0).unwrap()),
            dec!(0),
        ),
        (
            NaiveTime::from_hms_opt(13, 0, 0).unwrap(),
            None,
            dec!(0),
        ),
    ];
    let result = time_drift::services::time::day_actual_hours(&blocks);
    // One block is open, so total is None
    assert_eq!(result, None);
}

#[test]
fn test_daily_saldo() {
    let actual = Some(dec!(9.5));
    let target = dec!(8.0);
    let result = time_drift::services::time::daily_saldo(actual, target);
    assert_eq!(result, Some(dec!(1.5)));
}

#[test]
fn test_daily_saldo_negative() {
    let actual = Some(dec!(6.0));
    let target = dec!(8.0);
    let result = time_drift::services::time::daily_saldo(actual, target);
    assert_eq!(result, Some(dec!(-2.0)));
}

#[test]
fn test_daily_saldo_open_block() {
    let actual = None;
    let target = dec!(8.0);
    let result = time_drift::services::time::daily_saldo(actual, target);
    assert_eq!(result, None);
}

#[test]
fn test_default_target_hours_weekday() {
    use chrono::NaiveDate;
    // 2026-04-23 is a Thursday
    let date = NaiveDate::from_ymd_opt(2026, 4, 23).unwrap();
    assert_eq!(time_drift::services::time::default_target_hours(date), dec!(8.0));
}

#[test]
fn test_default_target_hours_saturday() {
    use chrono::NaiveDate;
    // 2026-04-25 is a Saturday
    let date = NaiveDate::from_ymd_opt(2026, 4, 25).unwrap();
    assert_eq!(time_drift::services::time::default_target_hours(date), dec!(0.0));
}

#[test]
fn test_default_target_hours_sunday() {
    use chrono::NaiveDate;
    // 2026-04-26 is a Sunday
    let date = NaiveDate::from_ymd_opt(2026, 4, 26).unwrap();
    assert_eq!(time_drift::services::time::default_target_hours(date), dec!(0.0));
}

#[test]
fn test_parse_time_hh_colon_mm() {
    let result = time_drift::services::time::parse_time_input("8:30");
    assert_eq!(result, Some(NaiveTime::from_hms_opt(8, 30, 0).unwrap()));
}

#[test]
fn test_parse_time_hh_mm_padded() {
    let result = time_drift::services::time::parse_time_input("08:30");
    assert_eq!(result, Some(NaiveTime::from_hms_opt(8, 30, 0).unwrap()));
}

#[test]
fn test_parse_time_hhmm_no_colon() {
    let result = time_drift::services::time::parse_time_input("0830");
    assert_eq!(result, Some(NaiveTime::from_hms_opt(8, 30, 0).unwrap()));
}

#[test]
fn test_parse_time_invalid() {
    let result = time_drift::services::time::parse_time_input("25:00");
    assert_eq!(result, None);
}

#[test]
fn test_parse_time_empty() {
    let result = time_drift::services::time::parse_time_input("");
    assert_eq!(result, None);
}

#[test]
fn test_format_decimal_hours() {
    assert_eq!(time_drift::services::time::format_hours(dec!(8.5)), "8.50");
    assert_eq!(time_drift::services::time::format_hours(dec!(-1.25)), "-1.25");
    assert_eq!(time_drift::services::time::format_hours(dec!(0)), "0.00");
}

#[test]
fn test_format_saldo_display() {
    assert_eq!(time_drift::services::time::format_saldo(dec!(1.5)), "+1.50");
    assert_eq!(time_drift::services::time::format_saldo(dec!(-2.0)), "-2.00");
    assert_eq!(time_drift::services::time::format_saldo(dec!(0)), "±0.00");
}
```

- [ ] **Step 3: Add rust_decimal_macros dev-dependency**

Add to `Cargo.toml` under `[dev-dependencies]`:

```toml
[dev-dependencies]
rust_decimal_macros = "1"
```

Also, add `lib.rs` so integration tests can access the crate. Create `src/lib.rs`:

```rust
pub mod config;
pub mod db;
pub mod models;
pub mod services;
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cargo test --test service_tests
```

Expected: FAIL — `time_drift::services::time` module has no functions yet.

- [ ] **Step 5: Implement src/services/time.rs**

```rust
use chrono::{Datelike, NaiveDate, NaiveTime, Weekday};
use rust_decimal::Decimal;
use rust_decimal::prelude::*;

/// Calculate actual hours for a single time block.
/// Returns None if end_time is None (block still running).
pub fn block_actual_hours(
    start: NaiveTime,
    end: Option<NaiveTime>,
    break_hours: Decimal,
) -> Option<Decimal> {
    let end = end?;
    let duration = end.signed_duration_since(start);
    let total_seconds = Decimal::from(duration.num_seconds());
    let hours = total_seconds / Decimal::from(3600);
    Some(hours - break_hours)
}

/// Calculate total actual hours for a day from its blocks.
/// Returns None if any block has no end_time (still running).
/// Input: slice of (start_time, end_time, break_hours) tuples.
pub fn day_actual_hours(
    blocks: &[(NaiveTime, Option<NaiveTime>, Decimal)],
) -> Option<Decimal> {
    let mut total = Decimal::ZERO;
    for (start, end, brk) in blocks {
        let hours = block_actual_hours(*start, *end, *brk)?;
        total += hours;
    }
    Some(total)
}

/// Calculate daily saldo: actual_hours - target_hours.
/// Returns None if actual hours are unknown (open block).
pub fn daily_saldo(actual: Option<Decimal>, target: Decimal) -> Option<Decimal> {
    actual.map(|a| a - target)
}

/// Default target hours for a given date.
/// Weekdays (Mon-Fri): 8.0, Weekends (Sat-Sun): 0.0.
pub fn default_target_hours(date: NaiveDate) -> Decimal {
    match date.weekday() {
        Weekday::Sat | Weekday::Sun => Decimal::ZERO,
        _ => Decimal::from(8),
    }
}

/// Parse a time string in various formats: "8:30", "08:30", "0830".
/// Returns None if the input is invalid.
pub fn parse_time_input(input: &str) -> Option<NaiveTime> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }

    // Try HH:MM or H:MM format
    if let Ok(t) = NaiveTime::parse_from_str(input, "%H:%M") {
        return Some(t);
    }

    // Try HHMM format (4 digits, no colon)
    if input.len() == 4 && input.chars().all(|c| c.is_ascii_digit()) {
        let hours: u32 = input[..2].parse().ok()?;
        let minutes: u32 = input[2..].parse().ok()?;
        return NaiveTime::from_hms_opt(hours, minutes, 0);
    }

    None
}

/// Format decimal hours as a string with 2 decimal places: "8.50"
pub fn format_hours(hours: Decimal) -> String {
    format!("{:.2}", hours)
}

/// Format saldo with sign prefix: "+1.50", "-2.00", "±0.00"
pub fn format_saldo(saldo: Decimal) -> String {
    if saldo > Decimal::ZERO {
        format!("+{:.2}", saldo)
    } else if saldo < Decimal::ZERO {
        format!("{:.2}", saldo)
    } else {
        "±0.00".to_string()
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cargo test --test service_tests
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add time service with business logic and unit tests"
```

---

### Task 5: Base Template, Static Assets & CSS

**Files:**
- Create: `templates/base.html`
- Create: `templates/partials/saldo_badge.html`
- Create: `static/style.css`
- Create: `static/htmx.min.js` (download HTMX)

- [ ] **Step 1: Download HTMX**

```bash
mkdir -p static
curl -L -o static/htmx.min.js https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js
```

- [ ] **Step 2: Create templates/base.html**

```bash
mkdir -p templates/partials
```

Write `templates/base.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Time Drift{% endblock %}</title>
    <link rel="stylesheet" href="/static/style.css">
    <script src="/static/htmx.min.js" defer></script>
</head>
<body>
    <nav class="nav">
        <a href="/" class="nav-brand">Time Drift</a>
        <div class="nav-links">
            <a href="/">Dashboard</a>
            <a href="/month">Month</a>
            <a href="/analytics">Analytics</a>
            <a href="/history">History</a>
        </div>
    </nav>
    <main class="container">
        {% block content %}{% endblock %}
    </main>
</body>
</html>
```

- [ ] **Step 3: Create templates/partials/saldo_badge.html**

```html
<span class="saldo-badge {% if is_positive %}saldo-positive{% elif is_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
    {{ formatted_saldo }}
</span>
```

- [ ] **Step 4: Create static/style.css**

```css
/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
    --color-bg: #f8f9fa;
    --color-surface: #ffffff;
    --color-text: #212529;
    --color-text-muted: #6c757d;
    --color-border: #dee2e6;
    --color-positive: #198754;
    --color-negative: #dc3545;
    --color-zero: #6c757d;
    --color-primary: #0d6efd;
    --color-primary-hover: #0b5ed7;
    --color-weekend: #f1f3f5;
    --radius: 8px;
    --shadow: 0 1px 3px rgba(0,0,0,0.1);
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: 1.5;
}

/* === Nav === */
.nav {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
}

.nav-brand {
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--color-text);
    text-decoration: none;
}

.nav-links { display: flex; gap: 1rem; }
.nav-links a {
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.9rem;
}
.nav-links a:hover { color: var(--color-primary); }

/* === Layout === */
.container {
    max-width: 960px;
    margin: 1.5rem auto;
    padding: 0 1rem;
}

/* === Cards === */
.card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1.25rem;
    box-shadow: var(--shadow);
    margin-bottom: 1rem;
}

.card-title {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
}

/* === Saldo Badge === */
.saldo-badge {
    font-weight: 700;
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
}
.saldo-positive { color: var(--color-positive); }
.saldo-negative { color: var(--color-negative); }
.saldo-zero { color: var(--color-zero); }

.saldo-badge.saldo-small {
    font-size: 0.9rem;
    font-weight: 600;
}

/* === Tables === */
.table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
}
.table th, .table td {
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
}
.table th {
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
}
.table .weekend { background: var(--color-weekend); }
.table .tabular { font-variant-numeric: tabular-nums; }

/* === Forms === */
.form-group {
    margin-bottom: 1rem;
}
.form-group label {
    display: block;
    font-weight: 600;
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
    color: var(--color-text-muted);
}
input[type="time"],
input[type="number"],
input[type="text"],
input[type="date"],
textarea,
select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    font-size: 0.95rem;
    font-family: inherit;
}
input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(13,110,253,0.15);
}

/* === Buttons === */
.btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: var(--radius);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s;
}
.btn-primary { background: var(--color-primary); color: white; }
.btn-primary:hover { background: var(--color-primary-hover); }
.btn-danger { background: var(--color-negative); color: white; }
.btn-danger:hover { background: #bb2d3b; }
.btn-secondary { background: var(--color-border); color: var(--color-text); }
.btn-secondary:hover { background: #c6cdd5; }
.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.8rem; }

/* === Time Block Row === */
.block-row {
    display: grid;
    grid-template-columns: 1fr 1fr 80px auto;
    gap: 0.5rem;
    align-items: end;
    margin-bottom: 0.5rem;
}

/* === Stat Cards === */
.stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
}
.stat-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1rem;
    text-align: center;
}
.stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
.stat-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
}

/* === Month Nav === */
.month-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
}
.month-nav h2 { font-size: 1.25rem; }

/* === Pagination === */
.pagination {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 1.5rem;
}

/* === Utility === */
.text-muted { color: var(--color-text-muted); }
.text-right { text-align: right; }
.mt-1 { margin-top: 0.5rem; }
.mt-2 { margin-top: 1rem; }
.mb-1 { margin-bottom: 0.5rem; }
.mb-2 { margin-bottom: 1rem; }
.flex { display: flex; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.gap-1 { gap: 0.5rem; }

/* === SVG Charts === */
.chart-container { width: 100%; overflow-x: auto; }
.chart-container svg { width: 100%; height: auto; }
svg text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
svg .axis-label { fill: var(--color-text-muted); font-size: 11px; }
svg .grid-line { stroke: var(--color-border); stroke-width: 0.5; }
svg .bar-actual { fill: var(--color-primary); }
svg .bar-target { fill: var(--color-border); }
svg .line-saldo { stroke: var(--color-primary); stroke-width: 2; fill: none; }
svg .dot-saldo { fill: var(--color-primary); }
svg .heatmap-cell { rx: 2; ry: 2; }

/* === Responsive === */
@media (max-width: 600px) {
    .nav { padding: 0.5rem; gap: 0.75rem; }
    .nav-links { gap: 0.5rem; }
    .container { padding: 0 0.5rem; margin: 1rem auto; }
    .block-row { grid-template-columns: 1fr 1fr; }
    .block-row .break-input { grid-column: 1; }
    .block-row .remove-btn { grid-column: 2; justify-self: end; }
    .table { font-size: 0.8rem; }
    .table th, .table td { padding: 0.35rem 0.5rem; }
}
```

- [ ] **Step 5: Verify it compiles**

```bash
cargo check
```

Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add base template, HTMX, and CSS styles"
```

---

### Task 6: Day Entry Editor — Routes & Templates

**Files:**
- Create: `src/routes/mod.rs`
- Create: `src/routes/day.rs`
- Create: `templates/day_form.html`
- Create: `templates/partials/time_block_row.html`
- Modify: `src/main.rs` (add routes module, wire up router)

This is the core CRUD — creating and editing daily time entries.

- [ ] **Step 1: Create src/routes/mod.rs**

```rust
pub mod day;

use axum::Router;
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .merge(day::router())
}
```

- [ ] **Step 2: Create templates/partials/time_block_row.html**

This HTMX fragment renders a single time block form row. It's used both in the full form and when adding a new block dynamically.

```html
<div class="block-row" id="block-{{ index }}">
    <div class="form-group">
        <label>Start</label>
        <input type="time" name="starts" value="{{ start_value }}" required>
    </div>
    <div class="form-group">
        <label>End</label>
        <input type="time" name="ends" value="{{ end_value }}">
    </div>
    <div class="form-group break-input">
        <label>Break (h)</label>
        <input type="number" name="breaks" value="{{ break_value }}" step="0.25" min="0">
    </div>
    <div class="form-group remove-btn">
        <label>&nbsp;</label>
        <button type="button" class="btn btn-danger btn-sm"
                hx-delete="/day/{{ date }}/block/{{ index }}"
                hx-target="#block-{{ index }}"
                hx-swap="outerHTML">✕</button>
    </div>
</div>
```

- [ ] **Step 3: Create templates/day_form.html**

```html
{% extends "base.html" %}

{% block title %}{{ date }} — Time Drift{% endblock %}

{% block content %}
<div class="flex-between mb-2">
    <h1>{{ weekday }}, {{ date }}</h1>
    {% if exists %}
    <form method="POST" action="/day/{{ date }}/delete"
          onsubmit="return confirm('Delete this day entry?')">
        <button type="submit" class="btn btn-danger btn-sm">Delete</button>
    </form>
    {% endif %}
</div>

<form method="POST" action="/day/{{ date }}">
    <div class="card">
        <div class="form-group">
            <label>Target Hours (Soll)</label>
            <input type="number" name="target_hours" value="{{ target_hours }}"
                   step="0.5" min="0" max="24" style="max-width: 120px;">
        </div>

        <div class="card-title">Time Blocks</div>
        <div id="blocks-container">
            {% for block in blocks %}
            {% include "partials/time_block_row.html" %}
            {% endfor %}
        </div>

        <button type="button" class="btn btn-secondary btn-sm mt-1"
                hx-get="/day/{{ date }}/add-block?index={{ blocks.len() }}"
                hx-target="#blocks-container"
                hx-swap="beforeend">
            + Add Block
        </button>

        <div class="form-group mt-2">
            <label>Note</label>
            <textarea name="note" rows="2" placeholder="Optional remark...">{{ note }}</textarea>
        </div>
    </div>

    {% if actual_hours.is_some() %}
    <div class="card">
        <div class="flex-between">
            <div>
                <span class="text-muted">Actual:</span>
                <strong>{{ formatted_actual }}h</strong>
            </div>
            <div>
                <span class="text-muted">Saldo:</span>
                <span class="saldo-badge saldo-small {% if saldo_positive %}saldo-positive{% elif saldo_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
                    {{ formatted_saldo }}
                </span>
            </div>
        </div>
    </div>
    {% endif %}

    <button type="submit" class="btn btn-primary">Save</button>
    <a href="/month/{{ month_str }}" class="btn btn-secondary">Cancel</a>
</form>
{% endblock %}
```

- [ ] **Step 4: Create src/routes/day.rs**

```rust
use axum::{
    extract::{Path, Query, State},
    response::{Html, IntoResponse, Redirect},
    routing::{get, post},
    Form, Router,
};
use askama::Template;
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use rust_decimal::prelude::*;
use serde::Deserialize;
use sqlx::PgPool;

use crate::models;
use crate::services::time as time_svc;

// --- Templates ---

#[derive(Template)]
#[template(path = "day_form.html")]
struct DayFormTemplate {
    date: String,
    weekday: String,
    month_str: String,
    exists: bool,
    target_hours: String,
    note: String,
    blocks: Vec<BlockView>,
    actual_hours: Option<String>,
    formatted_actual: String,
    formatted_saldo: String,
    saldo_positive: bool,
    saldo_negative: bool,
}

struct BlockView {
    index: usize,
    date: String,
    start_value: String,
    end_value: String,
    break_value: String,
}

#[derive(Template)]
#[template(path = "partials/time_block_row.html")]
struct TimeBlockRowTemplate {
    index: usize,
    date: String,
    start_value: String,
    end_value: String,
    break_value: String,
}

// --- Handlers ---

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/day/{date}", get(show_day).post(save_day))
        .route("/day/{date}/delete", post(delete_day))
        .route("/day/{date}/add-block", get(add_block))
}

#[derive(Deserialize)]
struct AddBlockQuery {
    index: usize,
}

async fn show_day(
    State(pool): State<PgPool>,
    Path(date_str): Path<String>,
) -> impl IntoResponse {
    let date = match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return Html("Invalid date format".to_string()).into_response(),
    };

    let day = models::get_day_with_blocks(&pool, date).await.ok().flatten();

    let (exists, target_hours, note, blocks_data) = match &day {
        Some(d) => {
            let blocks: Vec<BlockView> = d
                .blocks
                .iter()
                .enumerate()
                .map(|(i, b)| BlockView {
                    index: i,
                    date: date_str.clone(),
                    start_value: b.start_time.format("%H:%M").to_string(),
                    end_value: b
                        .end_time
                        .map(|t| t.format("%H:%M").to_string())
                        .unwrap_or_default(),
                    break_value: format!("{}", b.break_hours),
                })
                .collect();
            (
                true,
                format!("{}", d.entry.target_hours),
                d.entry.note.clone().unwrap_or_default(),
                blocks,
            )
        }
        None => {
            let default_target = time_svc::default_target_hours(date);
            let default_block = vec![BlockView {
                index: 0,
                date: date_str.clone(),
                start_value: String::new(),
                end_value: String::new(),
                break_value: "0".to_string(),
            }];
            (
                false,
                format!("{}", default_target),
                String::new(),
                default_block,
            )
        }
    };

    // Calculate actual hours and saldo for display
    let (actual_hours, formatted_actual, formatted_saldo, saldo_positive, saldo_negative) =
        if let Some(d) = &day {
            let block_tuples: Vec<_> = d
                .blocks
                .iter()
                .map(|b| (b.start_time, b.end_time, b.break_hours))
                .collect();
            let actual = time_svc::day_actual_hours(&block_tuples);
            let target: Decimal = d.entry.target_hours;
            let saldo = time_svc::daily_saldo(actual, target);
            (
                actual.map(|a| time_svc::format_hours(a)),
                actual
                    .map(|a| time_svc::format_hours(a))
                    .unwrap_or_else(|| "—".to_string()),
                saldo
                    .map(|s| time_svc::format_saldo(s))
                    .unwrap_or_else(|| "—".to_string()),
                saldo.map(|s| s > Decimal::ZERO).unwrap_or(false),
                saldo.map(|s| s < Decimal::ZERO).unwrap_or(false),
            )
        } else {
            (None, String::new(), String::new(), false, false)
        };

    let weekday = date.format("%A").to_string();
    let month_str = date.format("%Y-%m").to_string();

    let template = DayFormTemplate {
        date: date_str,
        weekday,
        month_str,
        exists,
        target_hours,
        note,
        blocks: blocks_data,
        actual_hours,
        formatted_actual,
        formatted_saldo,
        saldo_positive,
        saldo_negative,
    };

    Html(template.render().unwrap_or_else(|e| format!("Template error: {}", e))).into_response()
}

async fn save_day(
    State(pool): State<PgPool>,
    Path(date_str): Path<String>,
    Form(form): Form<models::DayFormInput>,
) -> impl IntoResponse {
    let date = match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return Redirect::to("/").into_response(),
    };

    let note = form
        .note
        .filter(|n| !n.trim().is_empty())
        .map(|n| n.trim().to_string());

    // Upsert the entry
    let entry = match models::upsert_entry(&pool, date, form.target_hours, note).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to upsert entry: {}", e);
            return Redirect::to(&format!("/day/{}", date_str)).into_response();
        }
    };

    // Delete existing blocks and re-insert
    let _ = models::delete_blocks_for_entry(&pool, entry.id).await;

    let block_count = form.starts.len();
    for i in 0..block_count {
        let start = match time_svc::parse_time_input(&form.starts[i]) {
            Some(t) => t,
            None => continue, // skip empty/invalid rows
        };

        let end = if i < form.ends.len() {
            time_svc::parse_time_input(&form.ends[i])
        } else {
            None
        };

        let break_hours: Decimal = if i < form.breaks.len() {
            form.breaks[i].parse().unwrap_or(Decimal::ZERO)
        } else {
            Decimal::ZERO
        };

        let _ = models::insert_block(&pool, entry.id, start, end, break_hours, i as i16).await;
    }

    let month_str = date.format("%Y-%m").to_string();
    Redirect::to(&format!("/month/{}", month_str)).into_response()
}

async fn delete_day(
    State(pool): State<PgPool>,
    Path(date_str): Path<String>,
) -> impl IntoResponse {
    let date = match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return Redirect::to("/"),
    };

    let _ = models::delete_entry(&pool, date).await;
    let month_str = date.format("%Y-%m").to_string();
    Redirect::to(&format!("/month/{}", month_str))
}

async fn add_block(
    Path(date_str): Path<String>,
    Query(query): Query<AddBlockQuery>,
) -> impl IntoResponse {
    let template = TimeBlockRowTemplate {
        index: query.index,
        date: date_str,
        start_value: String::new(),
        end_value: String::new(),
        break_value: "0".to_string(),
    };
    Html(template.render().unwrap_or_default())
}
```

- [ ] **Step 5: Update src/main.rs to wire up routes**

Replace `src/main.rs`:

```rust
mod config;
mod db;
mod models;
mod routes;
mod services;

use axum::{routing::get, Router};
use std::net::SocketAddr;
use tower_http::services::ServeDir;

async fn health() -> &'static str {
    "OK"
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "time_drift=info".into()),
        )
        .init();

    let config = config::Config::from_env();
    let pool = db::create_pool(&config.database_url).await;
    db::run_migrations(&pool).await;

    let app = Router::new()
        .route("/health", get(health))
        .merge(routes::create_router())
        .nest_service("/static", ServeDir::new("static"))
        .with_state(pool);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 6: Verify it compiles**

```bash
cargo check
```

Expected: Compiles. May warn about unused fields in templates (Askama resolves these at compile time).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add day entry editor with CRUD routes and templates"
```

---

### Task 7: Dashboard Page

**Files:**
- Create: `src/routes/dashboard.rs`
- Create: `templates/dashboard.html`
- Modify: `src/routes/mod.rs` (add dashboard route)

- [ ] **Step 1: Create templates/dashboard.html**

```html
{% extends "base.html" %}

{% block title %}Dashboard — Time Drift{% endblock %}

{% block content %}
<div class="card">
    <div class="card-title">Running Saldo</div>
    <span class="saldo-badge {% if saldo_positive %}saldo-positive{% elif saldo_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
        {{ formatted_saldo }}h
    </span>
</div>

<div class="card">
    <div class="flex-between mb-1">
        <div class="card-title">Today — {{ today_weekday }}, {{ today_date }}</div>
        {% if not today_exists %}
        <a href="/day/{{ today_date }}" class="btn btn-primary btn-sm">+ Log Today</a>
        {% else %}
        <a href="/day/{{ today_date }}" class="btn btn-secondary btn-sm">Edit</a>
        {% endif %}
    </div>
    {% if today_exists %}
    <div class="flex-between">
        <div>
            {% for block in today_blocks %}
            <span class="text-muted">{{ block.start }}–{{ block.end }}</span>
            {% if not loop.last %}, {% endif %}
            {% endfor %}
        </div>
        <div>
            <strong>{{ today_actual }}h</strong>
            <span class="saldo-badge saldo-small {% if today_saldo_positive %}saldo-positive{% elif today_saldo_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
                {{ today_saldo }}
            </span>
        </div>
    </div>
    {% else %}
    <p class="text-muted">No entry yet.</p>
    {% endif %}
</div>

<div class="card">
    <div class="card-title">Last 7 Days</div>
    <table class="table">
        <thead>
            <tr>
                <th>Date</th>
                <th class="text-right">Actual</th>
                <th class="text-right">Target</th>
                <th class="text-right">Saldo</th>
            </tr>
        </thead>
        <tbody>
            {% for day in recent_days %}
            <tr class="{% if day.is_weekend %}weekend{% endif %}">
                <td><a href="/day/{{ day.date }}">{{ day.weekday_short }} {{ day.date_short }}</a></td>
                <td class="text-right tabular">{{ day.actual }}</td>
                <td class="text-right tabular">{{ day.target }}</td>
                <td class="text-right">
                    <span class="saldo-badge saldo-small {% if day.saldo_positive %}saldo-positive{% elif day.saldo_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
                        {{ day.saldo }}
                    </span>
                </td>
            </tr>
            {% endfor %}
        </tbody>
    </table>
</div>
{% endblock %}
```

- [ ] **Step 2: Create src/routes/dashboard.rs**

```rust
use axum::{extract::State, response::IntoResponse};
use askama::Template;
use chrono::{Datelike, Local, NaiveDate, Duration};
use rust_decimal::Decimal;
use rust_decimal::prelude::*;
use sqlx::PgPool;

use crate::models;
use crate::services::time as time_svc;

#[derive(Template)]
#[template(path = "dashboard.html")]
struct DashboardTemplate {
    formatted_saldo: String,
    saldo_positive: bool,
    saldo_negative: bool,
    today_date: String,
    today_weekday: String,
    today_exists: bool,
    today_blocks: Vec<TodayBlockView>,
    today_actual: String,
    today_saldo: String,
    today_saldo_positive: bool,
    today_saldo_negative: bool,
    recent_days: Vec<RecentDayView>,
}

struct TodayBlockView {
    start: String,
    end: String,
}

struct RecentDayView {
    date: String,
    date_short: String,
    weekday_short: String,
    actual: String,
    target: String,
    saldo: String,
    saldo_positive: bool,
    saldo_negative: bool,
    is_weekend: bool,
}

pub async fn handler(State(pool): State<PgPool>) -> impl IntoResponse {
    let today = Local::now().date_naive();

    // Get total saldo
    let total_saldo = models::get_total_saldo(&pool)
        .await
        .unwrap_or(Decimal::ZERO);

    // Get today's entry
    let today_day = models::get_day_with_blocks(&pool, today)
        .await
        .ok()
        .flatten();

    let (today_exists, today_blocks, today_actual, today_saldo, today_saldo_positive, today_saldo_negative) =
        match &today_day {
            Some(d) => {
                let blocks: Vec<TodayBlockView> = d
                    .blocks
                    .iter()
                    .map(|b| TodayBlockView {
                        start: b.start_time.format("%H:%M").to_string(),
                        end: b
                            .end_time
                            .map(|t| t.format("%H:%M").to_string())
                            .unwrap_or_else(|| "…".to_string()),
                    })
                    .collect();

                let block_tuples: Vec<_> = d
                    .blocks
                    .iter()
                    .map(|b| (b.start_time, b.end_time, b.break_hours))
                    .collect();
                let actual = time_svc::day_actual_hours(&block_tuples);
                let saldo = time_svc::daily_saldo(actual, d.entry.target_hours);

                (
                    true,
                    blocks,
                    actual
                        .map(|a| time_svc::format_hours(a))
                        .unwrap_or_else(|| "—".to_string()),
                    saldo
                        .map(|s| time_svc::format_saldo(s))
                        .unwrap_or_else(|| "—".to_string()),
                    saldo.map(|s| s > Decimal::ZERO).unwrap_or(false),
                    saldo.map(|s| s < Decimal::ZERO).unwrap_or(false),
                )
            }
            None => (
                false,
                vec![],
                String::new(),
                String::new(),
                false,
                false,
            ),
        };

    // Get last 7 days
    let from = today - Duration::days(6);
    let days = models::get_entries_for_date_range(&pool, from, today)
        .await
        .unwrap_or_default();

    let mut recent_days: Vec<RecentDayView> = Vec::new();
    let mut current = today;
    while current >= from {
        let day_data = days.iter().find(|d| d.entry.date == current);
        let (actual, target, saldo, sp, sn) = match day_data {
            Some(d) => {
                let block_tuples: Vec<_> = d
                    .blocks
                    .iter()
                    .map(|b| (b.start_time, b.end_time, b.break_hours))
                    .collect();
                let actual = time_svc::day_actual_hours(&block_tuples);
                let saldo = time_svc::daily_saldo(actual, d.entry.target_hours);
                (
                    actual
                        .map(|a| time_svc::format_hours(a))
                        .unwrap_or_else(|| "—".to_string()),
                    time_svc::format_hours(d.entry.target_hours),
                    saldo
                        .map(|s| time_svc::format_saldo(s))
                        .unwrap_or_else(|| "—".to_string()),
                    saldo.map(|s| s > Decimal::ZERO).unwrap_or(false),
                    saldo.map(|s| s < Decimal::ZERO).unwrap_or(false),
                )
            }
            None => ("—".to_string(), "—".to_string(), "—".to_string(), false, false),
        };

        let is_weekend = matches!(
            current.weekday(),
            chrono::Weekday::Sat | chrono::Weekday::Sun
        );

        recent_days.push(RecentDayView {
            date: current.format("%Y-%m-%d").to_string(),
            date_short: current.format("%d.%m").to_string(),
            weekday_short: current.format("%a").to_string(),
            actual,
            target,
            saldo,
            saldo_positive: sp,
            saldo_negative: sn,
            is_weekend,
        });

        current -= Duration::days(1);
    }

    let template = DashboardTemplate {
        formatted_saldo: time_svc::format_saldo(total_saldo),
        saldo_positive: total_saldo > Decimal::ZERO,
        saldo_negative: total_saldo < Decimal::ZERO,
        today_date: today.format("%Y-%m-%d").to_string(),
        today_weekday: today.format("%A").to_string(),
        today_exists,
        today_blocks,
        today_actual,
        today_saldo,
        today_saldo_positive,
        today_saldo_negative,
        recent_days,
    };

    axum::response::Html(template.render().unwrap_or_else(|e| format!("Template error: {}", e)))
}
```

- [ ] **Step 3: Update src/routes/mod.rs**

```rust
pub mod dashboard;
pub mod day;

use axum::{routing::get, Router};
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .route("/", get(dashboard::handler))
        .merge(day::router())
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cargo check
```

Expected: Compiles.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add dashboard page with saldo badge and recent days"
```

---

### Task 8: Monthly View

**Files:**
- Create: `src/routes/month.rs`
- Create: `templates/month.html`
- Create: `templates/partials/day_summary_row.html`
- Modify: `src/routes/mod.rs` (add month route)

- [ ] **Step 1: Create templates/partials/day_summary_row.html**

```html
<tr class="{% if is_weekend %}weekend{% endif %}">
    <td><a href="/day/{{ date }}">{{ weekday_short }} {{ date_short }}</a></td>
    <td>
        {% for block in blocks_display %}
        <span class="text-muted">{{ block }}</span>
        {% if not loop.last %}<br>{% endif %}
        {% endfor %}
    </td>
    <td class="text-right tabular">{{ actual }}</td>
    <td class="text-right tabular">{{ target }}</td>
    <td class="text-right">
        <span class="saldo-badge saldo-small {% if saldo_positive %}saldo-positive{% elif saldo_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
            {{ saldo }}
        </span>
    </td>
</tr>
```

- [ ] **Step 2: Create templates/month.html**

```html
{% extends "base.html" %}

{% block title %}{{ month_label }} — Time Drift{% endblock %}

{% block content %}
<div class="month-nav">
    <a href="/month/{{ prev_month }}" class="btn btn-secondary btn-sm">← {{ prev_month_label }}</a>
    <h2>{{ month_label }}</h2>
    <a href="/month/{{ next_month }}" class="btn btn-secondary btn-sm">{{ next_month_label }} →</a>
</div>

<div class="card">
    <table class="table">
        <thead>
            <tr>
                <th>Date</th>
                <th>Time Blocks</th>
                <th class="text-right">Actual</th>
                <th class="text-right">Target</th>
                <th class="text-right">Saldo</th>
            </tr>
        </thead>
        <tbody>
            {% for day in days %}
            {% include "partials/day_summary_row.html" %}
            {% endfor %}
        </tbody>
        <tfoot>
            <tr>
                <td colspan="2"><strong>Total</strong></td>
                <td class="text-right tabular"><strong>{{ total_actual }}</strong></td>
                <td class="text-right tabular"><strong>{{ total_target }}</strong></td>
                <td class="text-right">
                    <span class="saldo-badge saldo-small {% if total_saldo_positive %}saldo-positive{% elif total_saldo_negative %}saldo-negative{% else %}saldo-zero{% endif %}">
                        <strong>{{ total_saldo }}</strong>
                    </span>
                </td>
            </tr>
        </tfoot>
    </table>
</div>
{% endblock %}
```

- [ ] **Step 3: Create src/routes/month.rs**

```rust
use axum::{extract::{Path, State}, response::IntoResponse};
use askama::Template;
use chrono::{Datelike, Local, NaiveDate, Duration};
use rust_decimal::Decimal;
use rust_decimal::prelude::*;
use sqlx::PgPool;

use crate::models;
use crate::services::time as time_svc;

#[derive(Template)]
#[template(path = "month.html")]
struct MonthTemplate {
    month_label: String,
    prev_month: String,
    prev_month_label: String,
    next_month: String,
    next_month_label: String,
    days: Vec<MonthDayView>,
    total_actual: String,
    total_target: String,
    total_saldo: String,
    total_saldo_positive: bool,
    total_saldo_negative: bool,
}

struct MonthDayView {
    date: String,
    date_short: String,
    weekday_short: String,
    blocks_display: Vec<String>,
    actual: String,
    target: String,
    saldo: String,
    saldo_positive: bool,
    saldo_negative: bool,
    is_weekend: bool,
}

pub async fn handler(
    State(pool): State<PgPool>,
    path: Option<Path<String>>,
) -> impl IntoResponse {
    let today = Local::now().date_naive();

    let (year, month) = match path {
        Some(Path(ym)) => {
            let parts: Vec<&str> = ym.split('-').collect();
            if parts.len() == 2 {
                let y: i32 = parts[0].parse().unwrap_or(today.year());
                let m: u32 = parts[1].parse().unwrap_or(today.month());
                (y, m)
            } else {
                (today.year(), today.month())
            }
        }
        None => (today.year(), today.month()),
    };

    let first_day = NaiveDate::from_ymd_opt(year, month, 1).unwrap_or(today);
    let last_day = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap()
    } - Duration::days(1);

    let entries = models::get_entries_for_date_range(&pool, first_day, last_day)
        .await
        .unwrap_or_default();

    let mut days: Vec<MonthDayView> = Vec::new();
    let mut sum_actual = Decimal::ZERO;
    let mut sum_target = Decimal::ZERO;
    let mut sum_saldo = Decimal::ZERO;

    let mut current = first_day;
    while current <= last_day {
        let is_weekend = matches!(
            current.weekday(),
            chrono::Weekday::Sat | chrono::Weekday::Sun
        );

        let day_data = entries.iter().find(|d| d.entry.date == current);

        let (blocks_display, actual, target, saldo, sp, sn) = match day_data {
            Some(d) => {
                let blocks_disp: Vec<String> = d
                    .blocks
                    .iter()
                    .map(|b| {
                        let end_str = b
                            .end_time
                            .map(|t| t.format("%H:%M").to_string())
                            .unwrap_or_else(|| "…".to_string());
                        let brk = if b.break_hours > Decimal::ZERO {
                            format!(" ({}h brk)", b.break_hours)
                        } else {
                            String::new()
                        };
                        format!("{}–{}{}", b.start_time.format("%H:%M"), end_str, brk)
                    })
                    .collect();

                let block_tuples: Vec<_> = d
                    .blocks
                    .iter()
                    .map(|b| (b.start_time, b.end_time, b.break_hours))
                    .collect();
                let actual = time_svc::day_actual_hours(&block_tuples);
                let target = d.entry.target_hours;
                let saldo = time_svc::daily_saldo(actual, target);

                if let Some(a) = actual {
                    sum_actual += a;
                }
                sum_target += target;
                if let Some(s) = saldo {
                    sum_saldo += s;
                }

                (
                    blocks_disp,
                    actual
                        .map(|a| time_svc::format_hours(a))
                        .unwrap_or_else(|| "—".to_string()),
                    time_svc::format_hours(target),
                    saldo
                        .map(|s| time_svc::format_saldo(s))
                        .unwrap_or_else(|| "—".to_string()),
                    saldo.map(|s| s > Decimal::ZERO).unwrap_or(false),
                    saldo.map(|s| s < Decimal::ZERO).unwrap_or(false),
                )
            }
            None => (
                vec![],
                "—".to_string(),
                if is_weekend {
                    "0.00".to_string()
                } else {
                    "8.00".to_string()
                },
                "—".to_string(),
                false,
                false,
            ),
        };

        days.push(MonthDayView {
            date: current.format("%Y-%m-%d").to_string(),
            date_short: current.format("%d").to_string(),
            weekday_short: current.format("%a").to_string(),
            blocks_display,
            actual,
            target,
            saldo,
            saldo_positive: sp,
            saldo_negative: sn,
            is_weekend,
        });

        current += Duration::days(1);
    }

    // Prev/Next month
    let prev = if month == 1 {
        NaiveDate::from_ymd_opt(year - 1, 12, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(year, month - 1, 1).unwrap()
    };
    let next = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap()
    };

    let template = MonthTemplate {
        month_label: first_day.format("%B %Y").to_string(),
        prev_month: prev.format("%Y-%m").to_string(),
        prev_month_label: prev.format("%b %Y").to_string(),
        next_month: next.format("%Y-%m").to_string(),
        next_month_label: next.format("%b %Y").to_string(),
        days,
        total_actual: time_svc::format_hours(sum_actual),
        total_target: time_svc::format_hours(sum_target),
        total_saldo: time_svc::format_saldo(sum_saldo),
        total_saldo_positive: sum_saldo > Decimal::ZERO,
        total_saldo_negative: sum_saldo < Decimal::ZERO,
    };

    axum::response::Html(template.render().unwrap_or_else(|e| format!("Template error: {}", e)))
}
```

- [ ] **Step 4: Update src/routes/mod.rs**

```rust
pub mod dashboard;
pub mod day;
pub mod month;

use axum::{routing::get, Router};
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .route("/", get(dashboard::handler))
        .route("/month", get(month::handler))
        .route("/month/{ym}", get(month::handler))
        .merge(day::router())
}
```

- [ ] **Step 5: Verify it compiles**

```bash
cargo check
```

Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add monthly view with day summaries and navigation"
```

---

**End of Part 1.** Continue with Part 2 for: History, Analytics, SVG Charts, Data Import, Docker, and CI/CD.
