//! Date-serial rendering: Excel 1900 (with the Lotus leap-year bug) and
//! 1904 systems, display-precision rounding with field carries, elapsed
//! tokens, and the date-token renderer.

use super::parse::{DateTok, Section, Tok};
use super::render::int_digits_string;
use super::Locale;

// ---------------------------------------------------------------------------
// Date rendering
// ---------------------------------------------------------------------------

/// Days from civil epoch algorithm (Howard Hinnant) — proleptic Gregorian.
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    ((y + if m <= 2 { 1 } else { 0 }) as i32, m, d)
}

fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = y as i64 - if m <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if m > 2 { m - 3 } else { m + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + d as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

struct DateParts {
    year: i32,
    month: u32,
    day: u32,
    weekday: u32, // 0 = Sunday
    hour: u32,
    minute: u32,
    second: u32,
    subsecond: f64,
    /// Whole elapsed seconds since serial zero, after display rounding.
    elapsed_seconds: f64,
}

/// Largest representable Excel serial: 9999-12-31 in the 1900 system. Beyond
/// this Excel fills the cell with #; we must also never feed huge serials
/// into the i64 civil-date math (overflow).
const MAX_DATE_SERIAL: f64 = 2_958_465.0;

/// Convert an Excel serial to date parts. Handles the 1900 Lotus leap-year bug
/// (serial 60 renders as the nonexistent 1900-02-29) and the 1904 system.
/// `has_time_tokens` controls display rounding: time formats round at their
/// finest displayed unit (so 23:59:59.9999 through `h:mm:ss` carries into the
/// next day), while date-only formats truncate the time of day — in Excel a
/// timestamp just before midnight never displays as the next day.
fn serial_to_parts(
    serial: f64,
    date1904: bool,
    subsecond_digits: u8,
    has_time_tokens: bool,
) -> Option<DateParts> {
    if serial < 0.0 && !date1904 {
        return None;
    }
    if !(-MAX_DATE_SERIAL..=MAX_DATE_SERIAL).contains(&serial) {
        return None;
    }
    let mut day_serial = serial.floor();
    let time = serial - day_serial;

    // Round time to the displayed precision so 23:59:59.9999 displays as the
    // next day, matching Excel.
    let units_per_day = if subsecond_digits > 0 {
        86_400.0 * 10f64.powi(subsecond_digits as i32)
    } else {
        86_400.0
    };
    let mut time_units = if has_time_tokens {
        (time * units_per_day).round()
    } else {
        0.0
    };
    if time_units >= units_per_day {
        time_units = 0.0;
        day_serial += 1.0;
    }

    let (year, month, day, weekday) = if date1904 {
        let days = days_from_civil(1904, 1, 1) + day_serial as i64;
        let (y, m, d) = civil_from_days(days);
        (y, m, d, weekday_from_days(days))
    } else {
        // 1900 system. Weekday always follows the Lotus convention: serial 1
        // is a Sunday, so weekday = (serial - 1) mod 7 with 0 = Sunday. For
        // serials >= 61 this happens to match the real calendar (the fake
        // leap day absorbs the shift), which is why a single formula works.
        let weekday = ((day_serial as i64 - 1).rem_euclid(7)) as u32;
        if day_serial == 60.0 {
            // The fake 1900-02-29 (Lotus leap-year bug).
            (1900, 2, 29, weekday)
        } else if day_serial == 0.0 {
            // Serial 0 displays as the nonexistent 1900-01-00.
            (1900, 1, 0, weekday)
        } else {
            let adjust = if day_serial < 60.0 { 1 } else { 2 };
            let days = days_from_civil(1899, 12, 31) + day_serial as i64 - (adjust - 1);
            let (y, m, d) = civil_from_days(days);
            (y, m, d, weekday)
        }
    };

    let total_seconds_scaled = time_units;
    let scale = if subsecond_digits > 0 {
        10f64.powi(subsecond_digits as i32)
    } else {
        1.0
    };
    let total_seconds = (total_seconds_scaled / scale).floor();
    let subsecond = (total_seconds_scaled - total_seconds * scale) / scale;
    let total_seconds = total_seconds as u64;

    Some(DateParts {
        year,
        month,
        day,
        weekday,
        hour: (total_seconds / 3600) as u32,
        minute: ((total_seconds / 60) % 60) as u32,
        second: (total_seconds % 60) as u32,
        subsecond,
        // Elapsed totals derive from the *rounded* display seconds so
        // 90-minute serials print 90:00, not 89:59-style floor drift.
        elapsed_seconds: day_serial.max(0.0) * 86_400.0 + total_seconds as f64,
    })
}

fn weekday_from_days(days: i64) -> u32 {
    // days==0 is 1970-01-01, a Thursday (=4 with Sunday=0).
    (((days % 7) + 7 + 4) % 7) as u32
}

pub(super) fn render_date(
    serial: f64,
    section: &Section,
    date1904: bool,
    locale: &Locale,
) -> String {
    let Some(parts) = serial_to_parts(serial, date1904, section.subsecond_digits, section.has_time)
    else {
        // Negative serial in the 1900 system: Excel shows #########; we emit
        // the error-style marker deterministically.
        return "#####".to_string();
    };
    let twelve_hour = section
        .toks
        .iter()
        .any(|t| matches!(t, Tok::Date(DateTok::AmPm { .. })));

    let mut out = String::new();
    for t in &section.toks {
        match t {
            Tok::Literal(s) => out.push_str(s),
            Tok::DecimalPoint => out.push(locale.decimal),
            Tok::FractionSlash => out.push('/'),
            Tok::Comma => out.push(','),
            Tok::Digit(_) => {}
            Tok::Date(d) => render_date_token(&mut out, *d, &parts, twelve_hour, date1904, locale),
            _ => {}
        }
    }
    out
}

fn push_padded(out: &mut String, v: u64, width: usize) {
    let s = int_digits_string(v);
    for _ in s.len()..width {
        out.push('0');
    }
    out.push_str(&s);
}

fn render_date_token(
    out: &mut String,
    tok: DateTok,
    p: &DateParts,
    twelve_hour: bool,
    _date1904: bool,
    locale: &Locale,
) {
    match tok {
        DateTok::Year2 => push_padded(out, (p.year % 100) as u64, 2),
        DateTok::Year4 => push_padded(out, p.year as u64, 4),
        DateTok::MonthNum { pad } => push_padded(out, p.month as u64, if pad { 2 } else { 1 }),
        DateTok::MonthAbbr => out.push_str(locale.months_abbr[(p.month - 1) as usize]),
        DateTok::MonthFull => out.push_str(locale.months[(p.month - 1) as usize]),
        DateTok::MonthLetter => {
            let m = locale.months[(p.month - 1) as usize];
            out.push_str(&m[..1]);
        }
        DateTok::DayNum { pad } => push_padded(out, p.day as u64, if pad { 2 } else { 1 }),
        DateTok::DayAbbr => out.push_str(locale.days_abbr[p.weekday as usize]),
        DateTok::DayFull => out.push_str(locale.days[p.weekday as usize]),
        DateTok::Hour { pad } => {
            let h = if twelve_hour {
                let h12 = p.hour % 12;
                if h12 == 0 {
                    12
                } else {
                    h12
                }
            } else {
                p.hour
            };
            push_padded(out, h as u64, if pad { 2 } else { 1 });
        }
        DateTok::Minute { pad } => push_padded(out, p.minute as u64, if pad { 2 } else { 1 }),
        DateTok::Second { pad } => push_padded(out, p.second as u64, if pad { 2 } else { 1 }),
        DateTok::ElapsedHour(w) => {
            let total = (p.elapsed_seconds / 3600.0).floor() as u64;
            push_padded(out, total, w as usize);
        }
        DateTok::ElapsedMinute(w) => {
            let total = (p.elapsed_seconds / 60.0).floor() as u64;
            push_padded(out, total, w as usize);
        }
        DateTok::ElapsedSecond(w) => {
            let total = p.elapsed_seconds as u64;
            push_padded(out, total, w as usize);
        }
        DateTok::AmPm { full } => {
            let am = p.hour < 12;
            if full {
                out.push_str(if am { "AM" } else { "PM" });
            } else {
                out.push_str(if am { "A" } else { "P" });
            }
        }
        DateTok::SubSecond(n) => {
            out.push(locale.decimal);
            let scaled = (p.subsecond * 10f64.powi(n as i32)).round() as u64;
            push_padded(out, scaled, n as usize);
        }
    }
}
