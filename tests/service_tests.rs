use chrono::NaiveTime;
use rust_decimal_macros::dec;

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
        (NaiveTime::from_hms_opt(8, 30, 0).unwrap(), Some(NaiveTime::from_hms_opt(17, 30, 0).unwrap()), dec!(1.0)),
        (NaiveTime::from_hms_opt(20, 0, 0).unwrap(), Some(NaiveTime::from_hms_opt(22, 30, 0).unwrap()), dec!(0)),
    ];
    let result = time_drift::services::time::day_actual_hours(&blocks);
    assert_eq!(result, Some(dec!(10.5)));
}

#[test]
fn test_day_actual_hours_with_open_block() {
    let blocks = vec![
        (NaiveTime::from_hms_opt(8, 30, 0).unwrap(), Some(NaiveTime::from_hms_opt(12, 0, 0).unwrap()), dec!(0)),
        (NaiveTime::from_hms_opt(13, 0, 0).unwrap(), None, dec!(0)),
    ];
    let result = time_drift::services::time::day_actual_hours(&blocks);
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
    let date = NaiveDate::from_ymd_opt(2026, 4, 23).unwrap(); // Thursday
    assert_eq!(time_drift::services::time::default_target_hours(date), dec!(8.0));
}

#[test]
fn test_default_target_hours_saturday() {
    use chrono::NaiveDate;
    let date = NaiveDate::from_ymd_opt(2026, 4, 25).unwrap(); // Saturday
    assert_eq!(time_drift::services::time::default_target_hours(date), dec!(0.0));
}

#[test]
fn test_default_target_hours_sunday() {
    use chrono::NaiveDate;
    let date = NaiveDate::from_ymd_opt(2026, 4, 26).unwrap(); // Sunday
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
