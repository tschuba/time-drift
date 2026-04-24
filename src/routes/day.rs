use askama::Template;
use axum::{
    extract::{Path, Query, State},
    response::{Html, Redirect},
    routing::{get, post},
    Form, Router,
};
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::str::FromStr;

use crate::models::{self, DayFormInput};
use crate::services::time;

// ---------------------------------------------------------------------------
// View structs
// ---------------------------------------------------------------------------

/// A single time block rendered in the form.
pub struct BlockView {
    pub index: usize,
    pub date: String,
    pub start_value: String,
    pub end_value: String,
    pub break_value: String,
}

// ---------------------------------------------------------------------------
// Askama templates
// ---------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "day_form.html")]
struct DayFormTemplate {
    date: String,
    weekday: String,
    exists: bool,
    target_hours: String,
    blocks: Vec<BlockView>,
    blocks_len: usize,
    note: String,
    actual_hours: Option<Decimal>,
    formatted_actual: String,
    formatted_saldo: String,
    saldo_positive: bool,
    saldo_negative: bool,
    month_str: String,
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

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
pub struct AddBlockQuery {
    index: usize,
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/day/{date}", get(show_day).post(save_day))
        .route("/day/{date}/delete", post(delete_day))
        .route("/day/{date}/add-block", get(add_block))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /day/{date} — show the day entry editor form.
async fn show_day(
    State(pool): State<PgPool>,
    Path(date_str): Path<String>,
) -> Result<Html<String>, Html<String>> {
    let date = parse_date(&date_str)?;
    let day = models::get_day_with_blocks(&pool, date)
        .await
        .map_err(|e| internal_error(e))?;

    let (exists, target_hours, blocks, note) = match day {
        Some(d) => {
            let target = d.entry.target_hours;
            let note = d.entry.note.clone().unwrap_or_default();
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
                    break_value: format_break(b.break_hours),
                })
                .collect();
            (true, target, blocks, note)
        }
        None => {
            let target = time::default_target_hours(date);
            let blocks = vec![BlockView {
                index: 0,
                date: date_str.clone(),
                start_value: String::new(),
                end_value: String::new(),
                break_value: String::new(),
            }];
            (false, target, blocks, String::new())
        }
    };

    // Compute actual hours and saldo from blocks data.
    let block_tuples: Vec<_> = if exists {
        let day = models::get_day_with_blocks(&pool, date)
            .await
            .map_err(|e| internal_error(e))?;
        match day {
            Some(d) => d
                .blocks
                .iter()
                .map(|b| (b.start_time, b.end_time, b.break_hours))
                .collect(),
            None => vec![],
        }
    } else {
        vec![]
    };

    let actual_hours = time::day_actual_hours(&block_tuples);
    let saldo = time::daily_saldo(actual_hours, target_hours);

    let formatted_actual = actual_hours
        .map(|a| time::format_hours(a))
        .unwrap_or_default();
    let formatted_saldo = saldo
        .map(|s| time::format_saldo(s))
        .unwrap_or_default();
    let saldo_positive = saldo.map(|s| s > Decimal::ZERO).unwrap_or(false);
    let saldo_negative = saldo.map(|s| s < Decimal::ZERO).unwrap_or(false);

    let blocks_len = blocks.len();

    let tmpl = DayFormTemplate {
        date: date_str,
        weekday: weekday_name(date),
        exists,
        target_hours: format_target(target_hours),
        blocks,
        blocks_len,
        note,
        actual_hours,
        formatted_actual,
        formatted_saldo,
        saldo_positive,
        saldo_negative,
        month_str: date.format("%Y-%m").to_string(),
    };

    Ok(Html(tmpl.render().unwrap()))
}

/// POST /day/{date} — save (upsert) a day entry with its time blocks.
async fn save_day(
    State(pool): State<PgPool>,
    Path(date_str): Path<String>,
    Form(input): Form<DayFormInput>,
) -> Result<Redirect, Html<String>> {
    let date = parse_date(&date_str)?;
    let note_ref = input.note.as_deref().filter(|s| !s.trim().is_empty());

    let entry = models::upsert_entry(&pool, date, input.target_hours, note_ref)
        .await
        .map_err(|e| internal_error(e))?;

    // Delete old blocks and insert new ones.
    models::delete_blocks_for_entry(&pool, entry.id)
        .await
        .map_err(|e| internal_error(e))?;

    let count = input.starts.len();
    for i in 0..count {
        let start_str = input.starts.get(i).map(|s| s.as_str()).unwrap_or("");
        let end_str = input.ends.get(i).map(|s| s.as_str()).unwrap_or("");
        let break_str = input.breaks.get(i).map(|s| s.as_str()).unwrap_or("");

        let start = match time::parse_time_input(start_str) {
            Some(t) => t,
            None => continue, // skip blocks without a valid start time
        };
        let end = time::parse_time_input(end_str);
        let break_hours = Decimal::from_str(break_str.trim()).unwrap_or(Decimal::ZERO);

        models::insert_block(&pool, entry.id, start, end, break_hours, i as i16)
            .await
            .map_err(|e| internal_error(e))?;
    }

    let month_str = date.format("%Y-%m").to_string();
    Ok(Redirect::to(&format!("/month/{}", month_str)))
}

/// POST /day/{date}/delete — delete a day entry.
async fn delete_day(
    State(pool): State<PgPool>,
    Path(date_str): Path<String>,
) -> Result<Redirect, Html<String>> {
    let date = parse_date(&date_str)?;

    models::delete_entry(&pool, date)
        .await
        .map_err(|e| internal_error(e))?;

    let month_str = date.format("%Y-%m").to_string();
    Ok(Redirect::to(&format!("/month/{}", month_str)))
}

/// GET /day/{date}/add-block?index=N — return an HTMX fragment for a new empty block row.
async fn add_block(
    Path(date_str): Path<String>,
    Query(query): Query<AddBlockQuery>,
) -> Html<String> {
    let tmpl = TimeBlockRowTemplate {
        index: query.index,
        date: date_str,
        start_value: String::new(),
        end_value: String::new(),
        break_value: String::new(),
    };
    Html(tmpl.render().unwrap())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_date(s: &str) -> Result<NaiveDate, Html<String>> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|_| Html(format!("Invalid date: {}", s)))
}

fn internal_error(e: impl std::fmt::Display) -> Html<String> {
    tracing::error!("Internal error: {}", e);
    Html(format!("Internal error: {}", e))
}

fn weekday_name(date: NaiveDate) -> String {
    match date.weekday() {
        chrono::Weekday::Mon => "Monday".to_string(),
        chrono::Weekday::Tue => "Tuesday".to_string(),
        chrono::Weekday::Wed => "Wednesday".to_string(),
        chrono::Weekday::Thu => "Thursday".to_string(),
        chrono::Weekday::Fri => "Friday".to_string(),
        chrono::Weekday::Sat => "Saturday".to_string(),
        chrono::Weekday::Sun => "Sunday".to_string(),
    }
}

fn format_target(d: Decimal) -> String {
    // Remove trailing zeros for cleaner display: "8" instead of "8.00"
    let s = d.normalize().to_string();
    s
}

fn format_break(d: Decimal) -> String {
    if d == Decimal::ZERO {
        String::new()
    } else {
        d.normalize().to_string()
    }
}
