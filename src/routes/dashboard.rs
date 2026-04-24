use askama::Template;
use axum::{extract::State, response::Html};
use chrono::{Datelike, Local, NaiveDate, Weekday};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::models;
use crate::services::time;

// ---------------------------------------------------------------------------
// View structs
// ---------------------------------------------------------------------------

pub struct TodayBlockView {
    pub start: String,
    pub end: String,
}

pub struct RecentDayView {
    pub date: String,
    pub date_short: String,
    pub weekday_short: String,
    pub actual: String,
    pub target: String,
    pub saldo: String,
    pub saldo_positive: bool,
    pub saldo_negative: bool,
    pub is_weekend: bool,
}

// ---------------------------------------------------------------------------
// Askama template
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

pub async fn handler(
    State(pool): State<PgPool>,
) -> Result<Html<String>, Html<String>> {
    let today = Local::now().date_naive();
    let today_date = today.format("%Y-%m-%d").to_string();
    let today_weekday = weekday_name(today);

    // Total running saldo
    let total_saldo = models::get_total_saldo(&pool)
        .await
        .map_err(|e| internal_error(e))?;

    let formatted_saldo = time::format_saldo(total_saldo);
    let saldo_positive = total_saldo > Decimal::ZERO;
    let saldo_negative = total_saldo < Decimal::ZERO;

    // Today's entry
    let today_day = models::get_day_with_blocks(&pool, today)
        .await
        .map_err(|e| internal_error(e))?;

    let (today_exists, today_blocks, today_actual, today_saldo, today_saldo_positive, today_saldo_negative) =
        match today_day {
            Some(d) => {
                let block_tuples: Vec<_> = d
                    .blocks
                    .iter()
                    .map(|b| (b.start_time, b.end_time, b.break_hours))
                    .collect();

                let blocks_view: Vec<TodayBlockView> = d
                    .blocks
                    .iter()
                    .map(|b| TodayBlockView {
                        start: b.start_time.format("%H:%M").to_string(),
                        end: b
                            .end_time
                            .map(|t| t.format("%H:%M").to_string())
                            .unwrap_or_default(),
                    })
                    .collect();

                let actual = time::day_actual_hours(&block_tuples);
                let saldo = time::daily_saldo(actual, d.entry.target_hours);

                let actual_str = actual
                    .map(|a| time::format_hours(a))
                    .unwrap_or_else(|| "—".to_string());
                let saldo_str = saldo
                    .map(|s| time::format_saldo(s))
                    .unwrap_or_else(|| "—".to_string());
                let sp = saldo.map(|s| s > Decimal::ZERO).unwrap_or(false);
                let sn = saldo.map(|s| s < Decimal::ZERO).unwrap_or(false);

                (true, blocks_view, actual_str, saldo_str, sp, sn)
            }
            None => (
                false,
                Vec::new(),
                String::new(),
                String::new(),
                false,
                false,
            ),
        };

    // Last 7 days
    let from = today - chrono::Duration::days(6);
    let entries = models::get_entries_for_date_range(&pool, from, today)
        .await
        .map_err(|e| internal_error(e))?;

    // Build a lookup by date for entries we have
    let mut entries_map: std::collections::HashMap<NaiveDate, _> = entries
        .into_iter()
        .map(|d| (d.entry.date, d))
        .collect();

    // Build recent_days for all 7 days (descending: today first)
    let mut recent_days: Vec<RecentDayView> = Vec::with_capacity(7);
    for i in 0..7 {
        let date = today - chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let date_short = date.format("%m-%d").to_string();
        let weekday_short = weekday_short_name(date);
        let is_weekend = matches!(date.weekday(), Weekday::Sat | Weekday::Sun);

        let (actual, target, saldo, sp, sn) = match entries_map.remove(&date) {
            Some(d) => {
                let block_tuples: Vec<_> = d
                    .blocks
                    .iter()
                    .map(|b| (b.start_time, b.end_time, b.break_hours))
                    .collect();

                let actual = time::day_actual_hours(&block_tuples);
                let saldo = time::daily_saldo(actual, d.entry.target_hours);

                let actual_str = actual
                    .map(|a| time::format_hours(a))
                    .unwrap_or_else(|| "—".to_string());
                let target_str = time::format_hours(d.entry.target_hours);
                let saldo_str = saldo
                    .map(|s| time::format_saldo(s))
                    .unwrap_or_else(|| "—".to_string());
                let sp = saldo.map(|s| s > Decimal::ZERO).unwrap_or(false);
                let sn = saldo.map(|s| s < Decimal::ZERO).unwrap_or(false);

                (actual_str, target_str, saldo_str, sp, sn)
            }
            None => {
                // No entry for this date — show defaults
                let target = time::default_target_hours(date);
                let target_str = time::format_hours(target);
                let saldo_str = if target == Decimal::ZERO {
                    "±0.00".to_string()
                } else {
                    time::format_saldo(-target)
                };
                let sp = false;
                let sn = target > Decimal::ZERO;
                ("—".to_string(), target_str, saldo_str, sp, sn)
            }
        };

        recent_days.push(RecentDayView {
            date: date_str,
            date_short,
            weekday_short,
            actual,
            target,
            saldo,
            saldo_positive: sp,
            saldo_negative: sn,
            is_weekend,
        });
    }

    let tmpl = DashboardTemplate {
        formatted_saldo,
        saldo_positive,
        saldo_negative,
        today_date,
        today_weekday,
        today_exists,
        today_blocks,
        today_actual,
        today_saldo,
        today_saldo_positive,
        today_saldo_negative,
        recent_days,
    };

    Ok(Html(tmpl.render().unwrap()))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn weekday_name(date: NaiveDate) -> String {
    match date.weekday() {
        Weekday::Mon => "Monday".to_string(),
        Weekday::Tue => "Tuesday".to_string(),
        Weekday::Wed => "Wednesday".to_string(),
        Weekday::Thu => "Thursday".to_string(),
        Weekday::Fri => "Friday".to_string(),
        Weekday::Sat => "Saturday".to_string(),
        Weekday::Sun => "Sunday".to_string(),
    }
}

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
