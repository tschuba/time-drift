use askama::Template;
use axum::{
    extract::{Query, State},
    response::Html,
};
use chrono::{Datelike, NaiveDate, Weekday};
use rust_decimal::Decimal;
use serde::Deserialize;
use sqlx::PgPool;

use crate::models;
use crate::services::time;

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub page: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
}

// ---------------------------------------------------------------------------
// View structs
// ---------------------------------------------------------------------------

pub struct HistoryRow {
    pub date: String,
    pub date_short: String,
    pub weekday_short: String,
    pub actual: String,
    pub target: String,
    pub saldo: String,
    pub saldo_positive: bool,
    pub saldo_negative: bool,
    pub running: String,
    pub running_positive: bool,
    pub running_negative: bool,
    pub note: String,
    pub is_weekend: bool,
}

// ---------------------------------------------------------------------------
// Askama template
// ---------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "history.html")]
struct HistoryTemplate {
    rows: Vec<HistoryRow>,
    page: i64,
    total_pages: i64,
    total_entries: i64,
    filter_from: String,
    filter_to: String,
    has_filter: bool,
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const PAGE_SIZE: i64 = 50;

pub async fn handler(
    State(pool): State<PgPool>,
    Query(params): Query<HistoryQuery>,
) -> Result<Html<String>, Html<String>> {
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * PAGE_SIZE;

    // Parse optional date filters
    let from = params
        .from
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    let to = params
        .to
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let has_filter = from.is_some() || to.is_some();
    let filter_from = from
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();
    let filter_to = to
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();

    // Fetch paginated entries
    let (entries, total_entries) = models::get_entries_paginated(&pool, offset, PAGE_SIZE, from, to)
        .await
        .map_err(internal_error)?;

    let total_pages = if total_entries == 0 {
        1
    } else {
        (total_entries + PAGE_SIZE - 1) / PAGE_SIZE
    };

    // Build rows with running saldo
    let mut rows: Vec<HistoryRow> = Vec::with_capacity(entries.len());
    for day in &entries {
        let date = day.entry.date;
        let date_str = date.format("%Y-%m-%d").to_string();
        let date_short = date.format("%m-%d").to_string();
        let weekday_short = weekday_short_name(date);
        let is_weekend = matches!(date.weekday(), Weekday::Sat | Weekday::Sun);

        let block_tuples: Vec<_> = day
            .blocks
            .iter()
            .map(|b| (b.start_time, b.end_time, b.break_hours))
            .collect();

        let actual = time::day_actual_hours(&block_tuples);
        let saldo = time::daily_saldo(actual, day.entry.target_hours);

        let actual_str = actual
            .map(time::format_hours)
            .unwrap_or_else(|| "—".to_string());
        let target_str = time::format_hours(day.entry.target_hours);
        let saldo_str = saldo
            .map(time::format_saldo)
            .unwrap_or_else(|| "—".to_string());
        let sp = saldo.map(|s| s > Decimal::ZERO).unwrap_or(false);
        let sn = saldo.map(|s| s < Decimal::ZERO).unwrap_or(false);

        // Running saldo up to this date
        let running_dec = models::get_running_saldo_up_to(&pool, date)
            .await
            .map_err(internal_error)?;
        let running_str = time::format_saldo(running_dec);
        let rp = running_dec > Decimal::ZERO;
        let rn = running_dec < Decimal::ZERO;

        let note = day.entry.note.clone().unwrap_or_default();

        rows.push(HistoryRow {
            date: date_str,
            date_short,
            weekday_short,
            actual: actual_str,
            target: target_str,
            saldo: saldo_str,
            saldo_positive: sp,
            saldo_negative: sn,
            running: running_str,
            running_positive: rp,
            running_negative: rn,
            note,
            is_weekend,
        });
    }

    let tmpl = HistoryTemplate {
        rows,
        page,
        total_pages,
        total_entries,
        filter_from,
        filter_to,
        has_filter,
    };

    Ok(Html(tmpl.render().unwrap()))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn weekday_short_name(date: NaiveDate) -> String {
    match date.weekday() {
        Weekday::Mon => "Mon".to_string(),
        Weekday::Tue => "Tue".to_string(),
        Weekday::Wed => "Wed".to_string(),
        Weekday::Thu => "Thu".to_string(),
        Weekday::Fri => "Fri".to_string(),
        Weekday::Sat => "Sat".to_string(),
        Weekday::Sun => "Sun".to_string(),
    }
}

fn internal_error(e: impl std::fmt::Display) -> Html<String> {
    tracing::error!("Internal error: {}", e);
    Html(format!("Internal error: {}", e))
}
