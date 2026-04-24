use askama::Template;
use axum::{
    extract::{Path, State},
    response::Html,
};
use chrono::{Datelike, Local, NaiveDate, Weekday};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::models;
use crate::services::time;

// ---------------------------------------------------------------------------
// View structs
// ---------------------------------------------------------------------------

pub struct MonthDayView {
    pub date: String,
    pub date_short: String,
    pub weekday_short: String,
    pub blocks_display: Vec<String>,
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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

pub async fn handler(
    State(pool): State<PgPool>,
    ym: Option<Path<String>>,
) -> Result<Html<String>, Html<String>> {
    let (year, month) = match ym {
        Some(Path(ref s)) => parse_year_month(s)?,
        None => {
            let today = Local::now().date_naive();
            (today.year(), today.month())
        }
    };

    let first_day = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| internal_error("Invalid date"))?;
    let last_day = last_day_of_month(year, month);

    // Fetch entries for the month
    let entries = models::get_entries_for_date_range(&pool, first_day, last_day)
        .await
        .map_err(|e| internal_error(e))?;

    // Build lookup by date
    let mut entries_map: std::collections::HashMap<NaiveDate, _> = entries
        .into_iter()
        .map(|d| (d.entry.date, d))
        .collect();

    // Build day views and accumulate totals
    let mut days: Vec<MonthDayView> = Vec::new();
    let mut sum_actual = Decimal::ZERO;
    let mut sum_target = Decimal::ZERO;

    let mut current = first_day;
    while current <= last_day {
        let date_str = current.format("%Y-%m-%d").to_string();
        let date_short = current.format("%d").to_string();
        let weekday_short = weekday_short_name(current);
        let is_weekend = matches!(current.weekday(), Weekday::Sat | Weekday::Sun);

        let (blocks_display, actual_str, target_str, saldo_str, sp, sn, actual_dec, target_dec) =
            match entries_map.remove(&current) {
                Some(d) => {
                    let target = d.entry.target_hours;

                    // Build block display strings
                    let blocks_display: Vec<String> = d
                        .blocks
                        .iter()
                        .map(|b| {
                            let start = b.start_time.format("%H:%M").to_string();
                            let end = b
                                .end_time
                                .map(|t| t.format("%H:%M").to_string())
                                .unwrap_or_else(|| "…".to_string());
                            let brk = if b.break_hours > Decimal::ZERO {
                                format!(" ({}h brk)", b.break_hours.normalize())
                            } else {
                                String::new()
                            };
                            format!("{}–{}{}", start, end, brk)
                        })
                        .collect();

                    let block_tuples: Vec<_> = d
                        .blocks
                        .iter()
                        .map(|b| (b.start_time, b.end_time, b.break_hours))
                        .collect();

                    let actual = time::day_actual_hours(&block_tuples);
                    let saldo = time::daily_saldo(actual, target);

                    let actual_str = actual
                        .map(|a| time::format_hours(a))
                        .unwrap_or_else(|| "—".to_string());
                    let target_str = time::format_hours(target);
                    let saldo_str = saldo
                        .map(|s| time::format_saldo(s))
                        .unwrap_or_else(|| "—".to_string());
                    let sp = saldo.map(|s| s > Decimal::ZERO).unwrap_or(false);
                    let sn = saldo.map(|s| s < Decimal::ZERO).unwrap_or(false);

                    (
                        blocks_display,
                        actual_str,
                        target_str,
                        saldo_str,
                        sp,
                        sn,
                        actual.unwrap_or(Decimal::ZERO),
                        target,
                    )
                }
                None => {
                    let target = time::default_target_hours(current);
                    let target_str = time::format_hours(target);
                    let saldo_str = if target == Decimal::ZERO {
                        "±0.00".to_string()
                    } else {
                        time::format_saldo(-target)
                    };
                    let sp = false;
                    let sn = target > Decimal::ZERO;

                    (
                        Vec::new(),
                        "—".to_string(),
                        target_str,
                        saldo_str,
                        sp,
                        sn,
                        Decimal::ZERO,
                        target,
                    )
                }
            };

        sum_actual += actual_dec;
        sum_target += target_dec;

        days.push(MonthDayView {
            date: date_str,
            date_short,
            weekday_short,
            blocks_display,
            actual: actual_str,
            target: target_str,
            saldo: saldo_str,
            saldo_positive: sp,
            saldo_negative: sn,
            is_weekend,
        });

        current = current.succ_opt().unwrap();
    }

    // Totals
    let total_saldo_dec = sum_actual - sum_target;
    let total_actual = time::format_hours(sum_actual);
    let total_target = time::format_hours(sum_target);
    let total_saldo = time::format_saldo(total_saldo_dec);
    let total_saldo_positive = total_saldo_dec > Decimal::ZERO;
    let total_saldo_negative = total_saldo_dec < Decimal::ZERO;

    // Navigation
    let (prev_year, prev_month_num) = if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    };
    let (next_year, next_month_num) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };

    let month_label = format_month_label(year, month);
    let prev_month = format!("{:04}-{:02}", prev_year, prev_month_num);
    let prev_month_label = format_month_label(prev_year, prev_month_num);
    let next_month = format!("{:04}-{:02}", next_year, next_month_num);
    let next_month_label = format_month_label(next_year, next_month_num);

    let tmpl = MonthTemplate {
        month_label,
        prev_month,
        prev_month_label,
        next_month,
        next_month_label,
        days,
        total_actual,
        total_target,
        total_saldo,
        total_saldo_positive,
        total_saldo_negative,
    };

    Ok(Html(tmpl.render().unwrap()))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_year_month(s: &str) -> Result<(i32, u32), Html<String>> {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 2 {
        return Err(Html(format!("Invalid month format: {}", s)));
    }
    let year: i32 = parts[0]
        .parse()
        .map_err(|_| Html(format!("Invalid year: {}", parts[0])))?;
    let month: u32 = parts[1]
        .parse()
        .map_err(|_| Html(format!("Invalid month: {}", parts[1])))?;
    if !(1..=12).contains(&month) {
        return Err(Html(format!("Month out of range: {}", month)));
    }
    Ok((year, month))
}

fn last_day_of_month(year: i32, month: u32) -> NaiveDate {
    if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap() - chrono::Duration::days(1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap() - chrono::Duration::days(1)
    }
}

fn format_month_label(year: i32, month: u32) -> String {
    let name = match month {
        1 => "January",
        2 => "February",
        3 => "March",
        4 => "April",
        5 => "May",
        6 => "June",
        7 => "July",
        8 => "August",
        9 => "September",
        10 => "October",
        11 => "November",
        12 => "December",
        _ => "Unknown",
    };
    format!("{} {}", name, year)
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
