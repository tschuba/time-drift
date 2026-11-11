use chrono::{Datelike, NaiveDate, NaiveTime};
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
    pub return_to: Option<String>,
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
                EXTRACT(EPOCH FROM (
                    CASE WHEN b.end_time < b.start_time
                        THEN b.end_time::interval + interval '24 hours' - b.start_time::interval
                        ELSE b.end_time::interval - b.start_time::interval
                    END
                )) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0) as saldo
        FROM time_entries e
        WHERE NOT EXISTS (SELECT 1 FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NULL)
           OR EXISTS     (SELECT 1 FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)",
    )
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// Compute the running saldo (cumulative actual - target) for all entries up to and including a date.
pub async fn get_running_saldo_up_to(pool: &PgPool, date: NaiveDate) -> sqlx::Result<Decimal> {
    let row: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (
                    CASE WHEN b.end_time < b.start_time
                        THEN b.end_time::interval + interval '24 hours' - b.start_time::interval
                        ELSE b.end_time::interval - b.start_time::interval
                    END
                )) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0) as saldo
        FROM time_entries e
        WHERE e.date <= $1
          AND (
            NOT EXISTS (SELECT 1 FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NULL)
            OR EXISTS  (SELECT 1 FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
          )",
    )
    .bind(date)
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

// ---------------------------------------------------------------------------
// Analytics structs
// ---------------------------------------------------------------------------

/// Summary statistics for analytics.
#[derive(Debug, Clone)]
pub struct AnalyticsSummary {
    pub avg_actual_per_workday: Decimal,
    pub avg_daily_saldo: Decimal,
    pub total_overtime_this_month: Decimal,
    pub total_overtime_this_year: Decimal,
    pub busiest_weekday: String,
    pub overtime_frequency_pct: Decimal,
}

/// Data point for a saldo trend chart.
#[derive(Debug, Clone)]
pub struct SaldoTrendPoint {
    pub date: NaiveDate,
    pub cumulative_saldo: Decimal,
}

/// Data point for weekly/monthly hours comparison.
#[derive(Debug, Clone)]
pub struct PeriodHours {
    pub label: String,
    pub actual_hours: Decimal,
    pub target_hours: Decimal,
}

/// Data point for heatmap.
#[derive(Debug, Clone)]
pub struct HeatmapDay {
    pub date: NaiveDate,
    pub hours: Decimal,
}

// ---------------------------------------------------------------------------
// Analytics query functions
// ---------------------------------------------------------------------------

/// Compute analytics summary statistics across all recorded entries.
pub async fn get_analytics_summary(pool: &PgPool) -> sqlx::Result<AnalyticsSummary> {
    let today = chrono::Local::now().date_naive();
    let month_start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();
    let year_start = NaiveDate::from_ymd_opt(today.year(), 1, 1).unwrap();

    // avg_actual_per_workday: average actual hours on workdays with target > 0 and actual > 0
    let avg_actual_row: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(AVG(actual), 0)
         FROM (
             SELECT (SELECT COALESCE(SUM(
                 EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
             ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL) as actual
             FROM time_entries e
             WHERE e.target_hours > 0
         ) sub
         WHERE sub.actual > 0",
    )
    .fetch_one(pool)
    .await?;

    // avg_daily_saldo: average of (actual - target) across all entries
    let avg_saldo_row: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(AVG(
            (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0)
        FROM time_entries e",
    )
    .fetch_one(pool)
    .await?;

    // total_overtime_this_month
    let month_ot_row: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0)
        FROM time_entries e
        WHERE e.date >= $1 AND e.date <= $2",
    )
    .bind(month_start)
    .bind(today)
    .fetch_one(pool)
    .await?;

    // total_overtime_this_year
    let year_ot_row: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
            ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
            - e.target_hours
        ), 0)
        FROM time_entries e
        WHERE e.date >= $1 AND e.date <= $2",
    )
    .bind(year_start)
    .bind(today)
    .fetch_one(pool)
    .await?;

    // busiest_weekday: day name with highest average actual hours (workdays only)
    let busiest_row: Option<(String,)> = sqlx::query_as(
        "SELECT TO_CHAR(e.date, 'Day') as day_name
         FROM time_entries e
         WHERE e.target_hours > 0
         GROUP BY EXTRACT(ISODOW FROM e.date), TO_CHAR(e.date, 'Day')
         ORDER BY AVG(
             (SELECT COALESCE(SUM(
                 EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
             ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
         ) DESC
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    let busiest_weekday = busiest_row
        .map(|r| r.0.trim().to_string())
        .unwrap_or_else(|| "N/A".to_string());

    // overtime_frequency_pct: percentage of workdays where actual > target
    let freq_row: (Decimal,) = sqlx::query_as(
        "SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE
            ROUND(100.0 * SUM(CASE WHEN sub.actual > sub.target_hours THEN 1 ELSE 0 END)::numeric
                  / COUNT(*)::numeric, 1)
         END
         FROM (
             SELECT e.target_hours,
                    (SELECT COALESCE(SUM(
                        EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
                    ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL) as actual
             FROM time_entries e
             WHERE e.target_hours > 0
         ) sub",
    )
    .fetch_one(pool)
    .await?;

    Ok(AnalyticsSummary {
        avg_actual_per_workday: avg_actual_row.0,
        avg_daily_saldo: avg_saldo_row.0,
        total_overtime_this_month: month_ot_row.0,
        total_overtime_this_year: year_ot_row.0,
        busiest_weekday,
        overtime_frequency_pct: freq_row.0,
    })
}

/// Returns date + cumulative saldo up to that date, for each entry in the given range.
pub async fn get_saldo_trend(
    pool: &PgPool,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> sqlx::Result<Vec<SaldoTrendPoint>> {
    let rows: Vec<(NaiveDate, Decimal)> = sqlx::query_as(
        "SELECT e.date,
                SUM(
                    (SELECT COALESCE(SUM(
                        EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
                    ), 0) FROM time_blocks b WHERE b.entry_id = e2.id AND b.end_time IS NOT NULL)
                    - e2.target_hours
                ) as cumulative_saldo
         FROM time_entries e
         JOIN time_entries e2 ON e2.date <= e.date
         WHERE ($1::date IS NULL OR e.date >= $1)
           AND ($2::date IS NULL OR e.date <= $2)
         GROUP BY e.date
         ORDER BY e.date",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(date, cumulative_saldo)| SaldoTrendPoint {
            date,
            cumulative_saldo,
        })
        .collect())
}

/// Groups entries by month (YYYY-MM), summing actual and target hours per month.
pub async fn get_monthly_hours(
    pool: &PgPool,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> sqlx::Result<Vec<PeriodHours>> {
    let rows: Vec<(String, Decimal, Decimal)> = sqlx::query_as(
        "SELECT TO_CHAR(e.date, 'YYYY-MM') as label,
                COALESCE(SUM(
                    (SELECT COALESCE(SUM(
                        EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
                    ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
                ), 0) as actual_hours,
                COALESCE(SUM(e.target_hours), 0) as target_hours
         FROM time_entries e
         WHERE ($1::date IS NULL OR e.date >= $1)
           AND ($2::date IS NULL OR e.date <= $2)
         GROUP BY TO_CHAR(e.date, 'YYYY-MM')
         ORDER BY label",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(label, actual_hours, target_hours)| PeriodHours {
            label,
            actual_hours,
            target_hours,
        })
        .collect())
}

/// Returns date + actual hours for all entries in a given year (for heatmap).
pub async fn get_heatmap_data(pool: &PgPool, year: i32) -> sqlx::Result<Vec<HeatmapDay>> {
    let year_start = NaiveDate::from_ymd_opt(year, 1, 1).unwrap();
    let year_end = NaiveDate::from_ymd_opt(year, 12, 31).unwrap();

    let rows: Vec<(NaiveDate, Decimal)> = sqlx::query_as(
        "SELECT e.date,
                (SELECT COALESCE(SUM(
                    EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time THEN b.end_time::interval + interval '24 hours' - b.start_time::interval ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
                ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL) as hours
         FROM time_entries e
         WHERE e.date >= $1 AND e.date <= $2
         ORDER BY e.date",
    )
    .bind(year_start)
    .bind(year_end)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(date, hours)| HeatmapDay { date, hours })
        .collect())
}
