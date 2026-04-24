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

/// Fetch a single time entry by date.
pub async fn get_entry_by_date(
    pool: &PgPool,
    date: NaiveDate,
) -> sqlx::Result<Option<TimeEntry>> {
    sqlx::query_as::<_, TimeEntry>(
        "SELECT id, date, target_hours, note, created_at, updated_at
         FROM time_entries
         WHERE date = $1",
    )
    .bind(date)
    .fetch_optional(pool)
    .await
}

/// Fetch all time blocks for a given entry, ordered by sort_order then start_time.
pub async fn get_blocks_for_entry(
    pool: &PgPool,
    entry_id: Uuid,
) -> sqlx::Result<Vec<TimeBlock>> {
    sqlx::query_as::<_, TimeBlock>(
        "SELECT id, entry_id, start_time, end_time, break_hours, sort_order, created_at, updated_at
         FROM time_blocks
         WHERE entry_id = $1
         ORDER BY sort_order, start_time",
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await
}

/// Fetch a day entry with its blocks. Returns None if no entry exists for the date.
pub async fn get_day_with_blocks(
    pool: &PgPool,
    date: NaiveDate,
) -> sqlx::Result<Option<DayWithBlocks>> {
    let entry = match get_entry_by_date(pool, date).await? {
        Some(e) => e,
        None => return Ok(None),
    };

    let blocks = get_blocks_for_entry(pool, entry.id).await?;

    Ok(Some(DayWithBlocks { entry, blocks }))
}

/// Fetch all entries in a date range with their blocks.
pub async fn get_entries_for_date_range(
    pool: &PgPool,
    from: NaiveDate,
    to: NaiveDate,
) -> sqlx::Result<Vec<DayWithBlocks>> {
    let entries = sqlx::query_as::<_, TimeEntry>(
        "SELECT id, date, target_hours, note, created_at, updated_at
         FROM time_entries
         WHERE date >= $1 AND date <= $2
         ORDER BY date",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    if entries.is_empty() {
        return Ok(Vec::new());
    }

    let entry_ids: Vec<Uuid> = entries.iter().map(|e| e.id).collect();

    let blocks = sqlx::query_as::<_, TimeBlock>(
        "SELECT id, entry_id, start_time, end_time, break_hours, sort_order, created_at, updated_at
         FROM time_blocks
         WHERE entry_id = ANY($1)
         ORDER BY sort_order, start_time",
    )
    .bind(&entry_ids)
    .fetch_all(pool)
    .await?;

    let mut blocks_by_entry: std::collections::HashMap<Uuid, Vec<TimeBlock>> =
        std::collections::HashMap::new();
    for block in blocks {
        blocks_by_entry
            .entry(block.entry_id)
            .or_default()
            .push(block);
    }

    let days = entries
        .into_iter()
        .map(|entry| {
            let blocks = blocks_by_entry.remove(&entry.id).unwrap_or_default();
            DayWithBlocks { entry, blocks }
        })
        .collect();

    Ok(days)
}

/// Insert or update a time entry for a given date. Returns the upserted entry.
pub async fn upsert_entry(
    pool: &PgPool,
    date: NaiveDate,
    target_hours: Decimal,
    note: Option<&str>,
) -> sqlx::Result<TimeEntry> {
    sqlx::query_as::<_, TimeEntry>(
        "INSERT INTO time_entries (date, target_hours, note)
         VALUES ($1, $2, $3)
         ON CONFLICT (date) DO UPDATE
         SET target_hours = EXCLUDED.target_hours,
             note = EXCLUDED.note
         RETURNING id, date, target_hours, note, created_at, updated_at",
    )
    .bind(date)
    .bind(target_hours)
    .bind(note)
    .fetch_one(pool)
    .await
}

/// Delete all time blocks for a given entry.
pub async fn delete_blocks_for_entry(
    pool: &PgPool,
    entry_id: Uuid,
) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM time_blocks WHERE entry_id = $1")
        .bind(entry_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Insert a single time block. Returns the inserted block.
pub async fn insert_block(
    pool: &PgPool,
    entry_id: Uuid,
    start_time: NaiveTime,
    end_time: Option<NaiveTime>,
    break_hours: Decimal,
    sort_order: i16,
) -> sqlx::Result<TimeBlock> {
    sqlx::query_as::<_, TimeBlock>(
        "INSERT INTO time_blocks (entry_id, start_time, end_time, break_hours, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, entry_id, start_time, end_time, break_hours, sort_order, created_at, updated_at",
    )
    .bind(entry_id)
    .bind(start_time)
    .bind(end_time)
    .bind(break_hours)
    .bind(sort_order)
    .fetch_one(pool)
    .await
}

/// Delete a time entry by date. Returns true if a row was deleted.
pub async fn delete_entry(pool: &PgPool, date: NaiveDate) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM time_entries WHERE date = $1")
        .bind(date)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Compute the total saldo (actual hours minus target hours) across all entries.
pub async fn get_total_saldo(pool: &PgPool) -> sqlx::Result<Decimal> {
    let row: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0) as saldo
        FROM time_entries e",
    )
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// Fetch paginated entries with optional date filters. Returns (entries with blocks, total count).
pub async fn get_entries_paginated(
    pool: &PgPool,
    offset: i64,
    limit: i64,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> sqlx::Result<(Vec<DayWithBlocks>, i64)> {
    // Count total matching entries
    let count_row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)
         FROM time_entries
         WHERE ($1::date IS NULL OR date >= $1)
           AND ($2::date IS NULL OR date <= $2)",
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;

    let total = count_row.0;

    // Fetch the page of entries
    let entries = sqlx::query_as::<_, TimeEntry>(
        "SELECT id, date, target_hours, note, created_at, updated_at
         FROM time_entries
         WHERE ($1::date IS NULL OR date >= $1)
           AND ($2::date IS NULL OR date <= $2)
         ORDER BY date DESC
         LIMIT $3 OFFSET $4",
    )
    .bind(from)
    .bind(to)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    if entries.is_empty() {
        return Ok((Vec::new(), total));
    }

    // Batch-load blocks for all entries on this page
    let entry_ids: Vec<Uuid> = entries.iter().map(|e| e.id).collect();

    let blocks = sqlx::query_as::<_, TimeBlock>(
        "SELECT id, entry_id, start_time, end_time, break_hours, sort_order, created_at, updated_at
         FROM time_blocks
         WHERE entry_id = ANY($1)
         ORDER BY sort_order, start_time",
    )
    .bind(&entry_ids)
    .fetch_all(pool)
    .await?;

    let mut blocks_by_entry: std::collections::HashMap<Uuid, Vec<TimeBlock>> =
        std::collections::HashMap::new();
    for block in blocks {
        blocks_by_entry
            .entry(block.entry_id)
            .or_default()
            .push(block);
    }

    let days = entries
        .into_iter()
        .map(|entry| {
            let blocks = blocks_by_entry.remove(&entry.id).unwrap_or_default();
            DayWithBlocks { entry, blocks }
        })
        .collect();

    Ok((days, total))
}
