use chrono::{Datelike, NaiveDate, NaiveTime, Weekday};
use rust_decimal::Decimal;

/// Calculate actual hours for a single time block.
/// Returns None if end_time is None (block still running).
pub fn block_actual_hours(start: NaiveTime, end: Option<NaiveTime>, break_hours: Decimal) -> Option<Decimal> {
    let end = end?;
    let mut seconds = end.signed_duration_since(start).num_seconds();
    // Handle blocks ending at midnight (stored as 00:00:00, end < start)
    if seconds < 0 {
        seconds += 86400;
    }
    let hours = Decimal::from(seconds) / Decimal::from(3600);
    Some(hours - break_hours)
}

/// Calculate total actual hours for a day from its blocks.
/// Returns None if any block has no end_time.
pub fn day_actual_hours(blocks: &[(NaiveTime, Option<NaiveTime>, Decimal)]) -> Option<Decimal> {
    let mut total = Decimal::ZERO;
    for (start, end, brk) in blocks {
        let hours = block_actual_hours(*start, *end, *brk)?;
        total += hours;
    }
    Some(total)
}

/// Calculate daily saldo: actual_hours - target_hours.
pub fn daily_saldo(actual: Option<Decimal>, target: Decimal) -> Option<Decimal> {
    actual.map(|a| a - target)
}

/// Default target hours for a given date.
pub fn default_target_hours(date: NaiveDate) -> Decimal {
    match date.weekday() {
        Weekday::Sat | Weekday::Sun => Decimal::ZERO,
        _ => Decimal::from(8),
    }
}

/// Parse a time string in various formats: "8:30", "08:30", "0830".
pub fn parse_time_input(input: &str) -> Option<NaiveTime> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }
    if let Ok(t) = NaiveTime::parse_from_str(input, "%H:%M") {
        return Some(t);
    }
    if input.len() == 4 && input.chars().all(|c| c.is_ascii_digit()) {
        let hours: u32 = input[..2].parse().ok()?;
        let minutes: u32 = input[2..].parse().ok()?;
        return NaiveTime::from_hms_opt(hours, minutes, 0);
    }
    None
}

/// Format decimal hours as "8.50"
pub fn format_hours(hours: Decimal) -> String {
    format!("{:.2}", hours)
}

/// Format saldo with sign: "+1.50", "-2.00", "±0.00"
pub fn format_saldo(saldo: Decimal) -> String {
    if saldo > Decimal::ZERO {
        format!("+{:.2}", saldo)
    } else if saldo < Decimal::ZERO {
        format!("{:.2}", saldo)
    } else {
        "±0.00".to_string()
    }
}
