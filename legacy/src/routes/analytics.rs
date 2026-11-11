use askama::Template;
use axum::{
    extract::{Query, State},
    response::Html,
};
use chrono::{Datelike, Local, Months, NaiveDate};
use rust_decimal::Decimal;
use serde::Deserialize;
use sqlx::PgPool;

use crate::models;
use crate::services::{charts, time};

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AnalyticsQuery {
    pub range: Option<String>,
    pub heatmap_year: Option<i32>,
}

// ---------------------------------------------------------------------------
// Askama template
// ---------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "analytics.html")]
struct AnalyticsTemplate {
    avg_actual: String,
    avg_saldo: String,
    avg_saldo_positive: bool,
    avg_saldo_negative: bool,
    month_overtime: String,
    month_ot_positive: bool,
    month_ot_negative: bool,
    year_overtime: String,
    year_ot_positive: bool,
    year_ot_negative: bool,
    busiest_weekday: String,
    overtime_pct: String,
    range: String,
    saldo_trend_svg: String,
    hours_bar_svg: String,
    heatmap_svg: String,
    heatmap_year: i32,
    prev_heatmap_year: i32,
    next_heatmap_year: i32,
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

pub async fn handler(
    State(pool): State<PgPool>,
    Query(params): Query<AnalyticsQuery>,
) -> Result<Html<String>, Html<String>> {
    let today = Local::now().date_naive();

    // Parse range
    let range = params.range.unwrap_or_else(|| "1y".to_string());
    let (from, to) = parse_range(&range, today);

    // Heatmap year
    let heatmap_year = params.heatmap_year.unwrap_or_else(|| today.year());
    let prev_heatmap_year = heatmap_year - 1;
    let next_heatmap_year = heatmap_year + 1;

    // Stat cards
    let summary = models::get_analytics_summary(&pool)
        .await
        .map_err(internal_error)?;

    let avg_actual = time::format_hours(summary.avg_actual_per_workday);
    let avg_saldo = time::format_saldo(summary.avg_daily_saldo);
    let avg_saldo_positive = summary.avg_daily_saldo > Decimal::ZERO;
    let avg_saldo_negative = summary.avg_daily_saldo < Decimal::ZERO;

    let month_overtime = time::format_saldo(summary.total_overtime_this_month);
    let month_ot_positive = summary.total_overtime_this_month > Decimal::ZERO;
    let month_ot_negative = summary.total_overtime_this_month < Decimal::ZERO;

    let year_overtime = time::format_saldo(summary.total_overtime_this_year);
    let year_ot_positive = summary.total_overtime_this_year > Decimal::ZERO;
    let year_ot_negative = summary.total_overtime_this_year < Decimal::ZERO;

    let busiest_weekday = summary.busiest_weekday;
    let overtime_pct = format!("{:.1}", summary.overtime_frequency_pct);

    // Charts
    let trend_data = models::get_saldo_trend(&pool, from, to)
        .await
        .map_err(internal_error)?;
    let saldo_trend_svg = charts::render_saldo_trend(&trend_data);

    let monthly_data = models::get_monthly_hours(&pool, from, to)
        .await
        .map_err(internal_error)?;
    let hours_bar_svg = charts::render_hours_bar_chart(&monthly_data);

    let heatmap_data = models::get_heatmap_data(&pool, heatmap_year)
        .await
        .map_err(internal_error)?;
    let heatmap_svg = charts::render_heatmap(&heatmap_data, heatmap_year);

    let tmpl = AnalyticsTemplate {
        avg_actual,
        avg_saldo,
        avg_saldo_positive,
        avg_saldo_negative,
        month_overtime,
        month_ot_positive,
        month_ot_negative,
        year_overtime,
        year_ot_positive,
        year_ot_negative,
        busiest_weekday,
        overtime_pct,
        range,
        saldo_trend_svg,
        hours_bar_svg,
        heatmap_svg,
        heatmap_year,
        prev_heatmap_year,
        next_heatmap_year,
    };

    Ok(Html(tmpl.render().unwrap()))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse range string into (from, to) date bounds for queries.
fn parse_range(range: &str, today: NaiveDate) -> (Option<NaiveDate>, Option<NaiveDate>) {
    let to = Some(today);
    match range {
        "3m" => {
            let from = today.checked_sub_months(Months::new(3));
            (from, to)
        }
        "6m" => {
            let from = today.checked_sub_months(Months::new(6));
            (from, to)
        }
        "1y" => {
            let from = today.checked_sub_months(Months::new(12));
            (from, to)
        }
        "all" => (None, None),
        _ => {
            // Default to 1 year
            let from = today.checked_sub_months(Months::new(12));
            (from, to)
        }
    }
}

fn internal_error(e: impl std::fmt::Display) -> Html<String> {
    tracing::error!("Internal error: {}", e);
    Html(format!("Internal error: {}", e))
}
