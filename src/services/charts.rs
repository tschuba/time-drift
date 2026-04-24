use chrono::{Datelike, NaiveDate};
use rust_decimal::prelude::ToPrimitive;

use crate::models::{HeatmapDay, PeriodHours, SaldoTrendPoint};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WIDTH: f64 = 800.0;
const HEIGHT: f64 = 300.0;
const MARGIN_TOP: f64 = 20.0;
const MARGIN_RIGHT: f64 = 20.0;
const MARGIN_BOTTOM: f64 = 40.0;
const MARGIN_LEFT: f64 = 60.0;

// ---------------------------------------------------------------------------
// Saldo trend line chart
// ---------------------------------------------------------------------------

/// Renders a line chart showing cumulative saldo over time.
pub fn render_saldo_trend(points: &[SaldoTrendPoint]) -> String {
    let mut svg = String::with_capacity(4096);

    svg.push_str(&format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" preserveAspectRatio="xMidYMid meet">"##,
        WIDTH, HEIGHT
    ));

    if points.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" dominant-baseline="middle" fill="#6b7280" font-size="14">No data</text>"##,
            WIDTH / 2.0,
            HEIGHT / 2.0
        ));
        svg.push_str("</svg>");
        return svg;
    }

    let plot_w = WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    let plot_h = HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

    let values: Vec<f64> = points
        .iter()
        .map(|p| p.cumulative_saldo.to_f64().unwrap_or(0.0))
        .collect();

    let y_min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let y_max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    // Ensure we have a non-zero range; pad by 1 on each side if flat
    let (y_lo, y_hi) = if (y_max - y_min).abs() < 0.001 {
        (y_min - 1.0, y_max + 1.0)
    } else {
        let pad = (y_max - y_min) * 0.1;
        (y_min - pad, y_max + pad)
    };
    let y_range = y_hi - y_lo;

    let x_for = |i: usize| -> f64 {
        if points.len() == 1 {
            MARGIN_LEFT + plot_w / 2.0
        } else {
            MARGIN_LEFT + (i as f64) / ((points.len() - 1) as f64) * plot_w
        }
    };
    let y_for = |v: f64| -> f64 { MARGIN_TOP + plot_h - ((v - y_lo) / y_range) * plot_h };

    // Grid lines + Y-axis labels (5 steps)
    let steps = 5;
    for i in 0..=steps {
        let val = y_lo + (i as f64) / (steps as f64) * y_range;
        let y = y_for(val);
        svg.push_str(&format!(
            r##"<line x1="{}" y1="{:.1}" x2="{}" y2="{:.1}" class="grid-line" stroke="#e5e7eb" stroke-width="1"/>"##,
            MARGIN_LEFT, y, WIDTH - MARGIN_RIGHT, y
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{:.1}" text-anchor="end" dominant-baseline="middle" fill="#6b7280" font-size="11">{:.1}</text>"##,
            MARGIN_LEFT - 8.0, y, val
        ));
    }

    // Dashed zero line (if zero is in range)
    if y_lo <= 0.0 && y_hi >= 0.0 {
        let zero_y = y_for(0.0);
        svg.push_str(&format!(
            r##"<line x1="{}" y1="{:.1}" x2="{}" y2="{:.1}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="4,4"/>"##,
            MARGIN_LEFT, zero_y, WIDTH - MARGIN_RIGHT, zero_y
        ));
    }

    // Line path
    let mut path = String::new();
    for (i, v) in values.iter().enumerate() {
        let x = x_for(i);
        let y = y_for(*v);
        if i == 0 {
            path.push_str(&format!("M{:.1},{:.1}", x, y));
        } else {
            path.push_str(&format!(" L{:.1},{:.1}", x, y));
        }
    }
    svg.push_str(&format!(
        r##"<path d="{}" class="line-saldo" fill="none" stroke="#3b82f6" stroke-width="2"/>"##,
        path
    ));

    // Dots
    for (i, v) in values.iter().enumerate() {
        let x = x_for(i);
        let y = y_for(*v);
        svg.push_str(&format!(
            r##"<circle cx="{:.1}" cy="{:.1}" r="3" class="dot-saldo" fill="#3b82f6"/>"##,
            x, y
        ));
    }

    // X-axis labels: first and last dates
    if let (Some(first), Some(last)) = (points.first(), points.last()) {
        svg.push_str(&format!(
            r##"<text x="{:.1}" y="{}" text-anchor="start" fill="#6b7280" font-size="11">{}</text>"##,
            MARGIN_LEFT,
            HEIGHT - 8.0,
            first.date
        ));
        if points.len() > 1 {
            svg.push_str(&format!(
                r##"<text x="{:.1}" y="{}" text-anchor="end" fill="#6b7280" font-size="11">{}</text>"##,
                WIDTH - MARGIN_RIGHT,
                HEIGHT - 8.0,
                last.date
            ));
        }
    }

    svg.push_str("</svg>");
    svg
}

// ---------------------------------------------------------------------------
// Monthly hours grouped bar chart
// ---------------------------------------------------------------------------

/// Renders a grouped bar chart comparing actual vs target hours by period.
pub fn render_hours_bar_chart(periods: &[PeriodHours]) -> String {
    let mut svg = String::with_capacity(4096);

    svg.push_str(&format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" preserveAspectRatio="xMidYMid meet">"##,
        WIDTH, HEIGHT
    ));

    if periods.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" dominant-baseline="middle" fill="#6b7280" font-size="14">No data</text>"##,
            WIDTH / 2.0,
            HEIGHT / 2.0
        ));
        svg.push_str("</svg>");
        return svg;
    }

    let plot_w = WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    let plot_h = HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

    // Find max value for Y scale
    let y_max = periods
        .iter()
        .map(|p| {
            let a = p.actual_hours.to_f64().unwrap_or(0.0);
            let t = p.target_hours.to_f64().unwrap_or(0.0);
            a.max(t)
        })
        .fold(0.0_f64, f64::max);
    let y_ceil = if y_max < 1.0 { 1.0 } else { (y_max * 1.1).ceil() };

    let y_for = |v: f64| -> f64 { MARGIN_TOP + plot_h - (v / y_ceil) * plot_h };

    let n = periods.len();
    let group_w = plot_w / n as f64;
    let bar_w = (group_w * 0.35).min(30.0);
    let gap = 2.0;

    // Grid lines + Y-axis labels (5 steps)
    let steps = 5;
    for i in 0..=steps {
        let val = (i as f64) / (steps as f64) * y_ceil;
        let y = y_for(val);
        svg.push_str(&format!(
            r##"<line x1="{}" y1="{:.1}" x2="{}" y2="{:.1}" class="grid-line" stroke="#e5e7eb" stroke-width="1"/>"##,
            MARGIN_LEFT, y, WIDTH - MARGIN_RIGHT, y
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{:.1}" text-anchor="end" dominant-baseline="middle" fill="#6b7280" font-size="11">{:.0}</text>"##,
            MARGIN_LEFT - 8.0, y, val
        ));
    }

    // Bars
    for (i, period) in periods.iter().enumerate() {
        let group_x = MARGIN_LEFT + i as f64 * group_w + group_w / 2.0;
        let target = period.target_hours.to_f64().unwrap_or(0.0);
        let actual = period.actual_hours.to_f64().unwrap_or(0.0);

        // Target bar (left)
        let t_h = (target / y_ceil) * plot_h;
        let t_y = y_for(target);
        svg.push_str(&format!(
            r##"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" class="bar-target" fill="#93c5fd" rx="2"><title>Target: {:.1}h</title></rect>"##,
            group_x - bar_w - gap / 2.0,
            t_y,
            bar_w,
            t_h,
            target
        ));

        // Actual bar (right)
        let a_h = (actual / y_ceil) * plot_h;
        let a_y = y_for(actual);
        svg.push_str(&format!(
            r##"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" class="bar-actual" fill="#3b82f6" rx="2"><title>Actual: {:.1}h</title></rect>"##,
            group_x + gap / 2.0,
            a_y,
            bar_w,
            a_h,
            actual
        ));

        // X-axis label: extract MM from YYYY-MM
        let month_label = if period.label.len() >= 7 {
            &period.label[5..7]
        } else {
            &period.label
        };
        svg.push_str(&format!(
            r##"<text x="{:.1}" y="{}" text-anchor="middle" fill="#6b7280" font-size="11">{}</text>"##,
            group_x,
            HEIGHT - 8.0,
            month_label
        ));
    }

    svg.push_str("</svg>");
    svg
}

// ---------------------------------------------------------------------------
// GitHub-style heatmap
// ---------------------------------------------------------------------------

/// Renders a GitHub-style contribution heatmap for a year.
pub fn render_heatmap(data: &[HeatmapDay], year: i32) -> String {
    let cell_size: f64 = 13.0;
    let gap: f64 = 2.0;
    let step = cell_size + gap;

    let label_left: f64 = 30.0;
    let label_top: f64 = 10.0;
    let cols = 53;
    let rows = 7;

    let total_w = label_left + cols as f64 * step + 10.0;
    let total_h = label_top + rows as f64 * step + 30.0;

    let mut svg = String::with_capacity(8192);
    svg.push_str(&format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {:.0} {:.0}" preserveAspectRatio="xMidYMid meet">"##,
        total_w, total_h
    ));

    // Build a lookup: date -> hours
    let mut hours_map = std::collections::HashMap::new();
    let mut max_hours: f64 = 0.0;
    for d in data {
        let h = d.hours.to_f64().unwrap_or(0.0);
        if h > max_hours {
            max_hours = h;
        }
        hours_map.insert(d.date, h);
    }
    if max_hours < 1.0 {
        max_hours = 1.0;
    }

    // Weekday labels (Mon, Wed, Fri)
    let weekday_labels = [(0, "Mon"), (2, "Wed"), (4, "Fri")];
    for (row, label) in &weekday_labels {
        let y = label_top + (*row as f64) * step + cell_size * 0.75;
        svg.push_str(&format!(
            r##"<text x="0" y="{:.1}" fill="#6b7280" font-size="10">{}</text>"##,
            y, label
        ));
    }

    // Determine start date: Jan 1 of the given year
    let jan1 = NaiveDate::from_ymd_opt(year, 1, 1).unwrap();
    let dec31 = NaiveDate::from_ymd_opt(year, 12, 31).unwrap();

    // iso_weekday: Monday=1 .. Sunday=7 -> row index 0..6
    let mut current = jan1;
    while current <= dec31 {
        let day_of_year = current.ordinal0() as usize;
        let weekday_idx = current.weekday().num_days_from_monday() as usize; // 0=Mon, 6=Sun

        // Column = week number within the year (0-based)
        let jan1_weekday = jan1.weekday().num_days_from_monday() as usize;
        let col = (day_of_year + jan1_weekday) / 7;

        let x = label_left + col as f64 * step;
        let y = label_top + weekday_idx as f64 * step;

        let hours = hours_map.get(&current).copied().unwrap_or(0.0);
        let ratio = hours / max_hours;
        let color = if hours <= 0.0 {
            "#ebedf0"
        } else if ratio < 0.25 {
            "#9be9a8"
        } else if ratio < 0.50 {
            "#40c463"
        } else if ratio < 0.75 {
            "#30a14e"
        } else {
            "#216e39"
        };

        svg.push_str(&format!(
            r##"<rect x="{:.1}" y="{:.1}" width="{}" height="{}" rx="2" fill="{}"><title>{}: {:.1}h</title></rect>"##,
            x, y, cell_size, cell_size, color, current, hours
        ));

        current = current.succ_opt().unwrap();
    }

    // Year label at bottom center
    svg.push_str(&format!(
        r##"<text x="{:.0}" y="{:.0}" text-anchor="middle" fill="#6b7280" font-size="12">{}</text>"##,
        total_w / 2.0,
        total_h - 5.0,
        year
    ));

    svg.push_str("</svg>");
    svg
}
