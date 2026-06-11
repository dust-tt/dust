//! ECMA-376 / Excel number-format engine (spec §3.4).
//!
//! Pure function `(value, format, locale) -> FormattedCell`. Deterministic by
//! construction: no clocks, no float `format!("{}")` (digits come from `ryu`
//! plus explicit fixed-point expansion), en-US locale hardcoded behind a
//! `Locale` table for later extensibility.

use crate::value::ErrorCode;

/// Alignment hint per Excel "General" alignment rules; the cell style's
/// explicit horizontal alignment (if any) overrides this in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Left,
    Right,
    Center,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FormattedCell {
    pub text: String,
    pub align: Align,
    pub is_date: bool,
    /// Color name from a `[Red]`-style tag, lowercased (`"red"`); the UI may ignore it.
    pub color: Option<&'static str>,
}

/// Locale table. v1 ships en-US only; making this a parameter keeps the door
/// open without building locale infrastructure (spec §3.4).
pub struct Locale {
    pub decimal: char,
    pub group: char,
    pub months: [&'static str; 12],
    pub months_abbr: [&'static str; 12],
    pub days: [&'static str; 7],
    pub days_abbr: [&'static str; 7],
}

pub const EN_US: Locale = Locale {
    decimal: '.',
    group: ',',
    months: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
    months_abbr: [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    days: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ],
    days_abbr: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

/// Built-in format codes 0-49 (ECMA-376 §18.8.30, en-US conventions matching
/// SheetJS/SSF where the spec is locale-dependent). IDs 23-36 and 41-44 are
/// locale/accounting variants we map to common equivalents.
pub fn builtin_format(id: u32) -> Option<&'static str> {
    Some(match id {
        0 => "General",
        1 => "0",
        2 => "0.00",
        3 => "#,##0",
        4 => "#,##0.00",
        5 => "$#,##0_);($#,##0)",
        6 => "$#,##0_);[Red]($#,##0)",
        7 => "$#,##0.00_);($#,##0.00)",
        8 => "$#,##0.00_);[Red]($#,##0.00)",
        9 => "0%",
        10 => "0.00%",
        11 => "0.00E+00",
        12 => "# ?/?",
        13 => "# ??/??",
        14 => "m/d/yy",
        15 => "d-mmm-yy",
        16 => "d-mmm",
        17 => "mmm-yy",
        18 => "h:mm AM/PM",
        19 => "h:mm:ss AM/PM",
        20 => "h:mm",
        21 => "h:mm:ss",
        22 => "m/d/yy h:mm",
        37 => "#,##0 ;(#,##0)",
        38 => "#,##0 ;[Red](#,##0)",
        39 => "#,##0.00;(#,##0.00)",
        40 => "#,##0.00;[Red](#,##0.00)",
        41 => r#"_(* #,##0_);_(* \(#,##0\);_(* "-"_);_(@_)"#,
        42 => r#"_($* #,##0_);_($* \(#,##0\);_($* "-"_);_(@_)"#,
        43 => r#"_(* #,##0.00_);_(* \(#,##0.00\);_(* "-"??_);_(@_)"#,
        44 => r#"_($* #,##0.00_);_($* \(#,##0.00\);_($* "-"??_);_(@_)"#,
        45 => "mm:ss",
        46 => "[h]:mm:ss",
        47 => "mmss.0",
        48 => "##0.0E+0",
        49 => "@",
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// Format parsing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DateTok {
    Year2,
    Year4,
    /// `m`/`mm` resolved to month by context.
    MonthNum {
        pad: bool,
    },
    MonthAbbr,
    MonthFull,
    MonthLetter,
    DayNum {
        pad: bool,
    },
    DayAbbr,
    DayFull,
    Hour {
        pad: bool,
    },
    Minute {
        pad: bool,
    },
    Second {
        pad: bool,
    },
    /// `[h]`, `[m]`, `[s]` elapsed, with the bracketed token width (`[hh]` -> 2).
    ElapsedHour(u8),
    ElapsedMinute(u8),
    ElapsedSecond(u8),
    /// `AM/PM` (true) or `A/P` (false).
    AmPm {
        full: bool,
    },
    /// `.0`, `.00`, `.000` fractional seconds.
    SubSecond(u8),
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    /// `0`, `#` or `?` digit placeholder.
    Digit(char),
    DecimalPoint,
    Percent,
    /// Grouping/scaling comma (role resolved during analysis).
    Comma,
    /// `E+` / `E-`; `show_plus` = `E+`.
    Exp {
        show_plus: bool,
    },
    /// Fraction slash between numerator and denominator placeholders.
    FractionSlash,
    Literal(String),
    /// `@` text placeholder.
    Text,
    Date(DateTok),
    General,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum CondOp {
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
}

#[derive(Debug, Clone)]
struct Section {
    toks: Vec<Tok>,
    color: Option<&'static str>,
    condition: Option<(CondOp, f64)>,
    has_date: bool,
    has_digits: bool,
    has_text: bool,
    is_general: bool,
}

fn named_color(name: &str) -> Option<&'static str> {
    match name.to_ascii_lowercase().as_str() {
        "black" => Some("black"),
        "blue" => Some("blue"),
        "cyan" => Some("cyan"),
        "green" => Some("green"),
        "magenta" => Some("magenta"),
        "red" => Some("red"),
        "white" => Some("white"),
        "yellow" => Some("yellow"),
        _ => None,
    }
}

/// Split a format string into `;`-separated sections, respecting quotes,
/// brackets and backslash escapes.
fn split_sections(fmt: &str) -> Vec<&str> {
    let mut sections = Vec::new();
    let bytes = fmt.as_bytes();
    let mut start = 0;
    let mut i = 0;
    let mut in_quote = false;
    let mut in_bracket = false;
    while i < bytes.len() {
        match bytes[i] {
            b'"' if !in_bracket => in_quote = !in_quote,
            b'[' if !in_quote => in_bracket = true,
            b']' if !in_quote => in_bracket = false,
            b'\\' if !in_quote => i += 1,
            b';' if !in_quote && !in_bracket => {
                sections.push(&fmt[start..i]);
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    sections.push(&fmt[start..]);
    sections
}

fn parse_condition(body: &str) -> Option<(CondOp, f64)> {
    let body = body.trim();
    let (op, rest) = if let Some(r) = body.strip_prefix("<=") {
        (CondOp::Le, r)
    } else if let Some(r) = body.strip_prefix(">=") {
        (CondOp::Ge, r)
    } else if let Some(r) = body.strip_prefix("<>") {
        (CondOp::Ne, r)
    } else if let Some(r) = body.strip_prefix('<') {
        (CondOp::Lt, r)
    } else if let Some(r) = body.strip_prefix('>') {
        (CondOp::Gt, r)
    } else if let Some(r) = body.strip_prefix('=') {
        (CondOp::Eq, r)
    } else {
        return None;
    };
    rest.trim().parse::<f64>().ok().map(|n| (op, n))
}

fn parse_section(src: &str) -> Section {
    let mut toks: Vec<Tok> = Vec::new();
    let mut color = None;
    let mut condition = None;
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;

    let push_lit = |toks: &mut Vec<Tok>, s: &str| {
        if s.is_empty() {
            return;
        }
        if let Some(Tok::Literal(prev)) = toks.last_mut() {
            prev.push_str(s);
        } else {
            toks.push(Tok::Literal(s.to_string()));
        }
    };

    while i < chars.len() {
        let c = chars[i];
        match c {
            '"' => {
                let mut lit = String::new();
                i += 1;
                while i < chars.len() && chars[i] != '"' {
                    lit.push(chars[i]);
                    i += 1;
                }
                push_lit(&mut toks, &lit);
            }
            '\\' => {
                if i + 1 < chars.len() {
                    push_lit(&mut toks, &chars[i + 1].to_string());
                    i += 1;
                }
            }
            '_' => {
                // `_x` skips the width of x; we emit a plain space.
                push_lit(&mut toks, " ");
                if i + 1 < chars.len() {
                    i += 1;
                }
            }
            '*' => {
                // `*x` repeats x to fill the column; meaningless for us — skip both.
                if i + 1 < chars.len() {
                    i += 1;
                }
            }
            '[' => {
                let mut body = String::new();
                i += 1;
                while i < chars.len() && chars[i] != ']' {
                    body.push(chars[i]);
                    i += 1;
                }
                let lower = body.to_ascii_lowercase();
                if lower.chars().all(|ch| ch == 'h') && !lower.is_empty() {
                    toks.push(Tok::Date(DateTok::ElapsedHour(lower.len() as u8)));
                } else if lower.chars().all(|ch| ch == 'm') && !lower.is_empty() {
                    toks.push(Tok::Date(DateTok::ElapsedMinute(lower.len() as u8)));
                } else if lower.chars().all(|ch| ch == 's') && !lower.is_empty() {
                    toks.push(Tok::Date(DateTok::ElapsedSecond(lower.len() as u8)));
                } else if let Some(named) = named_color(&body) {
                    color = Some(named);
                } else if let Some(cond) = parse_condition(&body) {
                    condition = Some(cond);
                }
                // Unknown brackets ([Color47], [$-409], [$€-x]) are dropped;
                // currency-locale tags keep their literal symbol prefix.
                else if let Some(rest) = body.strip_prefix('$') {
                    let symbol = rest.split('-').next().unwrap_or("");
                    push_lit(&mut toks, symbol);
                }
            }
            '0' | '#' | '?' => toks.push(Tok::Digit(c)),
            '.' => {
                // `.0` after seconds is a sub-second token; resolved later.
                toks.push(Tok::DecimalPoint);
            }
            '%' => toks.push(Tok::Percent),
            ',' => toks.push(Tok::Comma),
            '@' => toks.push(Tok::Text),
            '/' => toks.push(Tok::FractionSlash),
            'E' | 'e' => {
                if i + 1 < chars.len() && (chars[i + 1] == '+' || chars[i + 1] == '-') {
                    toks.push(Tok::Exp {
                        show_plus: chars[i + 1] == '+',
                    });
                    i += 1;
                } else {
                    push_lit(&mut toks, &c.to_string());
                }
            }
            'A' | 'a' => {
                let rest: String = chars[i..].iter().collect::<String>().to_ascii_uppercase();
                if rest.starts_with("AM/PM") {
                    toks.push(Tok::Date(DateTok::AmPm { full: true }));
                    i += 4;
                } else if rest.starts_with("A/P") {
                    toks.push(Tok::Date(DateTok::AmPm { full: false }));
                    i += 2;
                } else {
                    push_lit(&mut toks, &c.to_string());
                }
            }
            'y' | 'Y' => {
                let n = run_len(&chars, i, |ch| ch.eq_ignore_ascii_case(&'y'));
                toks.push(Tok::Date(if n >= 3 {
                    DateTok::Year4
                } else {
                    DateTok::Year2
                }));
                i += n - 1;
            }
            'm' | 'M' => {
                let n = run_len(&chars, i, |ch| ch.eq_ignore_ascii_case(&'m'));
                let tok = match n {
                    1 => DateTok::MonthNum { pad: false },
                    2 => DateTok::MonthNum { pad: true },
                    3 => DateTok::MonthAbbr,
                    4 => DateTok::MonthFull,
                    _ => DateTok::MonthLetter,
                };
                toks.push(Tok::Date(tok));
                i += n - 1;
            }
            'd' | 'D' => {
                let n = run_len(&chars, i, |ch| ch.eq_ignore_ascii_case(&'d'));
                let tok = match n {
                    1 => DateTok::DayNum { pad: false },
                    2 => DateTok::DayNum { pad: true },
                    3 => DateTok::DayAbbr,
                    _ => DateTok::DayFull,
                };
                toks.push(Tok::Date(tok));
                i += n - 1;
            }
            'h' | 'H' => {
                let n = run_len(&chars, i, |ch| ch.eq_ignore_ascii_case(&'h'));
                toks.push(Tok::Date(DateTok::Hour { pad: n >= 2 }));
                i += n - 1;
            }
            's' | 'S' => {
                let n = run_len(&chars, i, |ch| ch.eq_ignore_ascii_case(&'s'));
                toks.push(Tok::Date(DateTok::Second { pad: n >= 2 }));
                i += n - 1;
            }
            'G' | 'g' => {
                let rest: String = chars[i..].iter().collect::<String>().to_ascii_lowercase();
                if rest.starts_with("general") {
                    toks.push(Tok::General);
                    i += "general".len() - 1;
                } else {
                    push_lit(&mut toks, &c.to_string());
                }
            }
            _ => push_lit(&mut toks, &c.to_string()),
        }
        i += 1;
    }

    // Post-pass 1: month-vs-minute disambiguation. An `m` is a minute when the
    // nearest date token before it is hours (or elapsed hours) or the nearest
    // date token after it is seconds.
    let date_positions: Vec<usize> = toks
        .iter()
        .enumerate()
        .filter(|(_, t)| matches!(t, Tok::Date(_)))
        .map(|(i, _)| i)
        .collect();
    for (di, &pos) in date_positions.iter().enumerate() {
        if let Tok::Date(DateTok::MonthNum { pad }) = toks[pos] {
            let prev = di.checked_sub(1).map(|p| &toks[date_positions[p]]);
            let next = date_positions.get(di + 1).map(|&p| &toks[p]);
            let after_hours = matches!(
                prev,
                Some(Tok::Date(DateTok::Hour { .. })) | Some(Tok::Date(DateTok::ElapsedHour(_)))
            );
            let before_seconds = matches!(
                next,
                Some(Tok::Date(DateTok::Second { .. })) | Some(Tok::Date(DateTok::SubSecond(_)))
            );
            if after_hours || before_seconds {
                toks[pos] = Tok::Date(DateTok::Minute { pad });
            }
        }
    }

    // Post-pass 2: `.0+` right after seconds becomes a sub-second token.
    let mut i = 0;
    while i < toks.len() {
        let is_seconds_context = i > 0
            && matches!(
                toks[i - 1],
                Tok::Date(DateTok::Second { .. }) | Tok::Date(DateTok::ElapsedSecond(_))
            );
        if is_seconds_context && toks[i] == Tok::DecimalPoint {
            let mut digits = 0u8;
            while i + 1 + (digits as usize) < toks.len()
                && matches!(toks[i + 1 + digits as usize], Tok::Digit('0'))
            {
                digits += 1;
            }
            if digits > 0 {
                toks.splice(
                    i..i + 1 + digits as usize,
                    [Tok::Date(DateTok::SubSecond(digits))],
                );
            }
        }
        i += 1;
    }

    let has_date = toks.iter().any(|t| matches!(t, Tok::Date(_)));
    let has_digits = toks
        .iter()
        .any(|t| matches!(t, Tok::Digit(_) | Tok::Exp { .. }));
    let has_text = toks.iter().any(|t| matches!(t, Tok::Text));
    let is_general = toks.iter().any(|t| matches!(t, Tok::General)) && !has_digits && !has_date;

    Section {
        toks,
        color,
        condition,
        has_date,
        has_digits,
        has_text,
        is_general,
    }
}

fn run_len(chars: &[char], start: usize, pred: impl Fn(&char) -> bool) -> usize {
    chars[start..].iter().take_while(|c| pred(c)).count()
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// Format a number (or date serial — date-ness is decided by the format).
pub fn format_number(value: f64, fmt: &str, date1904: bool, locale: &Locale) -> FormattedCell {
    if !value.is_finite() {
        return FormattedCell {
            text: ErrorCode::Num.as_str().to_string(),
            align: Align::Center,
            is_date: false,
            color: None,
        };
    }
    if fmt.is_empty() || fmt == "General" {
        return FormattedCell {
            text: format_general(value, locale),
            align: Align::Right,
            is_date: false,
            color: None,
        };
    }
    let sections: Vec<Section> = split_sections(fmt).into_iter().map(parse_section).collect();
    let (section, negate) = pick_number_section(&sections, value);
    if section.is_general
        || (!section.has_digits
            && !section.has_date
            && !section.has_text
            && section.toks.is_empty())
    {
        let text = format_general(if negate { -value } else { value }, locale);
        return FormattedCell {
            text,
            align: Align::Right,
            is_date: false,
            color: section.color,
        };
    }
    if section.has_date {
        let text = render_date(value, section, date1904, locale);
        return FormattedCell {
            text,
            align: Align::Right,
            is_date: true,
            color: section.color,
        };
    }
    if section.has_text && !section.has_digits {
        // A text-only section applied to a number (e.g. `;;;"hidden"`): literals only.
        let text = render_text_section(section, &format_general(value, locale));
        return FormattedCell {
            text,
            align: Align::Right,
            is_date: false,
            color: section.color,
        };
    }
    let text = render_number(value, section, locale, negate);
    FormattedCell {
        text,
        align: Align::Right,
        is_date: false,
        color: section.color,
    }
}

/// Format a text cell value through `fmt` (uses the 4th/text section if present).
pub fn format_text(value: &str, fmt: &str, _locale: &Locale) -> FormattedCell {
    let make = |text: String, color| FormattedCell {
        text,
        align: Align::Left,
        is_date: false,
        color,
    };
    if fmt.is_empty() || fmt == "General" || fmt == "@" {
        return make(value.to_string(), None);
    }
    let sections: Vec<Section> = split_sections(fmt).into_iter().map(parse_section).collect();
    let text_section = if sections.len() >= 4 {
        Some(&sections[3])
    } else {
        sections.iter().find(|s| s.has_text)
    };
    match text_section {
        Some(s) => make(render_text_section(s, value), s.color),
        // No text section: text shows as-is (Excel behavior).
        None => make(value.to_string(), None),
    }
}

pub fn format_bool(value: bool) -> FormattedCell {
    FormattedCell {
        text: if value {
            "TRUE".to_string()
        } else {
            "FALSE".to_string()
        },
        align: Align::Center,
        is_date: false,
        color: None,
    }
}

pub fn format_error(code: ErrorCode) -> FormattedCell {
    FormattedCell {
        text: code.as_str().to_string(),
        align: Align::Center,
        is_date: false,
        color: None,
    }
}

/// Section selection for numbers. Returns the section and whether the value's
/// sign is consumed by the section role (negative section implies abs()).
fn pick_number_section(sections: &[Section], value: f64) -> (&Section, bool) {
    let has_conditions = sections.iter().any(|s| s.condition.is_some());
    if has_conditions {
        for (idx, s) in sections.iter().enumerate() {
            if let Some((op, n)) = s.condition {
                let matches = match op {
                    CondOp::Lt => value < n,
                    CondOp::Le => value <= n,
                    CondOp::Gt => value > n,
                    CondOp::Ge => value >= n,
                    CondOp::Eq => value == n,
                    CondOp::Ne => value != n,
                };
                if matches {
                    // Excel quirk (mirrored by SSF): any section after the
                    // first consumes the sign even when condition-selected —
                    // custom conditional formats must spell out their own
                    // minus. Only the first section keeps the natural sign.
                    return (s, idx >= 1);
                }
            }
        }
        if let Some(s) = sections
            .iter()
            .find(|s| s.condition.is_none() && !s.has_text)
        {
            return (s, value < 0.0);
        }
        return (&sections[sections.len() - 1], false);
    }
    let number_sections: Vec<&Section> = sections.iter().take(3).collect();
    match number_sections.len() {
        0 | 1 => (&sections[0], false),
        2 => {
            if value < 0.0 {
                (number_sections[1], true)
            } else {
                (number_sections[0], false)
            }
        }
        _ => {
            if value > 0.0 {
                (number_sections[0], false)
            } else if value < 0.0 {
                (number_sections[1], true)
            } else {
                (number_sections[2], false)
            }
        }
    }
}

fn render_text_section(section: &Section, value: &str) -> String {
    let mut out = String::new();
    for t in &section.toks {
        match t {
            Tok::Text => out.push_str(value),
            Tok::Literal(s) => out.push_str(s),
            Tok::General => out.push_str(value),
            _ => {}
        }
    }
    out
}

// ---------------------------------------------------------------------------
// General formatting
// ---------------------------------------------------------------------------

/// Excel "General": decimal up to 11 significant digits in
/// [1e-4, 1e11), scientific with 6 significant digits otherwise.
pub fn format_general(value: f64, locale: &Locale) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    let a = value.abs();
    if (1e-4..1e11).contains(&a) {
        let rounded = round_to_significant(value, 11);
        let s = decimal_string(rounded.abs(), 14);
        let trimmed = trim_trailing_zeros(&s);
        let mut out = String::new();
        if value < 0.0 {
            out.push('-');
        }
        out.push_str(&trimmed.replace('.', &locale.decimal.to_string()));
        out
    } else {
        scientific_string(value, 5, true, 2, locale)
    }
}

fn round_to_significant(value: f64, digits: i32) -> f64 {
    if value == 0.0 {
        return 0.0;
    }
    let magnitude = value.abs().log10().floor() as i32;
    let factor = 10f64.powi(digits - 1 - magnitude);
    (value * factor).round() / factor
}

/// Fixed-point decimal expansion of a non-negative float with `max_decimals`
/// places, computed via ryu shortest representation re-expanded (never
/// `format!("{}")`, which is forbidden for determinism).
fn decimal_string(value: f64, max_decimals: u32) -> String {
    debug_assert!(value >= 0.0);
    let mut buf = ryu::Buffer::new();
    let shortest = buf.format_finite(value);
    // ryu emits either `123.456` or `1.23456e7` style; normalize to plain decimal.
    let plain = expand_scientific(shortest);
    round_decimal_string(&plain, max_decimals)
}

/// Expand `1.23e5`-style strings to plain decimal notation.
fn expand_scientific(s: &str) -> String {
    let lower = s.to_ascii_lowercase();
    let Some(epos) = lower.find('e') else {
        return s.to_string();
    };
    let mantissa = &s[..epos];
    let exp: i32 = s[epos + 1..].parse().unwrap_or(0);
    let (int_part, frac_part) = match mantissa.split_once('.') {
        Some((i, f)) => (i.to_string(), f.to_string()),
        None => (mantissa.to_string(), String::new()),
    };
    let digits: String = format!("{int_part}{frac_part}");
    let point = int_part.len() as i32 + exp;
    if point <= 0 {
        let zeros = "0".repeat((-point) as usize);
        trim_insignificant(format!("0.{zeros}{digits}"))
    } else if (point as usize) >= digits.len() {
        let zeros = "0".repeat(point as usize - digits.len());
        format!("{digits}{zeros}")
    } else {
        trim_insignificant(format!(
            "{}.{}",
            &digits[..point as usize],
            &digits[point as usize..]
        ))
    }
}

fn trim_insignificant(s: String) -> String {
    if s.contains('.') {
        let t = s.trim_end_matches('0');
        let t = t.strip_suffix('.').unwrap_or(t);
        t.to_string()
    } else {
        s
    }
}

/// Round a plain decimal string (non-negative) to `decimals` places,
/// half-away-from-zero, entirely in string space (no float re-parsing).
fn round_decimal_string(plain: &str, decimals: u32) -> String {
    let (int_part, frac_part) = match plain.split_once('.') {
        Some((i, f)) => (i, f),
        None => (plain, ""),
    };
    if frac_part.len() <= decimals as usize {
        return plain.to_string();
    }
    let kept = &frac_part[..decimals as usize];
    let next = frac_part.as_bytes()[decimals as usize];
    let mut digits: Vec<u8> = format!("{int_part}{kept}").into_bytes();
    if next >= b'5' {
        // Carry.
        let mut i = digits.len();
        loop {
            if i == 0 {
                digits.insert(0, b'1');
                break;
            }
            i -= 1;
            if digits[i] == b'9' {
                digits[i] = b'0';
            } else {
                digits[i] += 1;
                break;
            }
        }
    }
    let s = String::from_utf8(digits).unwrap_or_default();
    let int_len = s.len() - decimals as usize;
    if decimals == 0 {
        s[..int_len].to_string()
    } else {
        format!("{}.{}", &s[..int_len], &s[int_len..])
    }
}

fn trim_trailing_zeros(s: &str) -> String {
    trim_insignificant(s.to_string())
}

fn scientific_string(
    value: f64,
    mantissa_decimals: u32,
    show_plus: bool,
    exp_digits: usize,
    locale: &Locale,
) -> String {
    let a = value.abs();
    let mut exp = if a == 0.0 {
        0
    } else {
        a.log10().floor() as i32
    };
    let mut mantissa = a / 10f64.powi(exp);
    // Rounding the mantissa can push it to 10.0 (e.g. 9.99999...).
    let rounded = round_decimal_string(&decimal_string(mantissa, 17), mantissa_decimals);
    if rounded.starts_with("10") {
        exp += 1;
        mantissa = a / 10f64.powi(exp);
    }
    let mant_str = round_decimal_string(&decimal_string(mantissa, 17), mantissa_decimals);
    let mant_str = trim_trailing_zeros(&mant_str);
    let sign = if value < 0.0 { "-" } else { "" };
    let exp_sign = if exp < 0 {
        "-"
    } else if show_plus {
        "+"
    } else {
        ""
    };
    format!(
        "{sign}{}E{exp_sign}{:0width$}",
        mant_str.replace('.', &locale.decimal.to_string()),
        exp.unsigned_abs(),
        width = exp_digits
    )
}

// ---------------------------------------------------------------------------
// Number section rendering
// ---------------------------------------------------------------------------

struct NumberLayout<'a> {
    /// Tokens before the decimal point (or all, if none).
    int_toks: Vec<&'a Tok>,
    frac_toks: Vec<&'a Tok>,
    exp_toks: Vec<&'a Tok>,
    has_decimal: bool,
    exp: Option<bool>,
    grouping: bool,
    scale_commas: u32,
    percents: u32,
    fraction: Option<FractionSpec>,
}

struct FractionSpec {
    num_placeholders: usize,
    den_placeholders: usize,
    fixed_denominator: Option<u64>,
    /// Index in section toks where the fraction part (numerator start) begins.
    start: usize,
}

fn analyze_number_section(section: &Section) -> NumberLayout<'_> {
    let toks = &section.toks;

    // Fraction detection: digit run, slash, digit-or-literal-digit run.
    let mut fraction = None;
    if let Some(slash_pos) = toks.iter().position(|t| matches!(t, Tok::FractionSlash)) {
        let mut num_ph = 0;
        let mut start = slash_pos;
        for (idx, t) in toks[..slash_pos].iter().enumerate().rev() {
            match t {
                Tok::Digit(_) => {
                    num_ph += 1;
                    start = idx;
                }
                Tok::Literal(s) if s.trim().is_empty() && num_ph == 0 => {}
                _ => break,
            }
        }
        let mut den_ph = 0;
        let mut fixed: Option<u64> = None;
        for t in &toks[slash_pos + 1..] {
            match t {
                Tok::Digit(_) => den_ph += 1,
                Tok::Literal(s) if s.chars().all(|c| c.is_ascii_digit()) && den_ph == 0 => {
                    fixed = s.parse::<u64>().ok().filter(|&d| d > 0);
                    break;
                }
                _ => break,
            }
        }
        if num_ph > 0 && (den_ph > 0 || fixed.is_some()) {
            fraction = Some(FractionSpec {
                num_placeholders: num_ph,
                den_placeholders: den_ph,
                fixed_denominator: fixed,
                start,
            });
        }
    }

    let decimal_pos = toks.iter().position(|t| matches!(t, Tok::DecimalPoint));
    let exp_pos = toks.iter().position(|t| matches!(t, Tok::Exp { .. }));

    let mut int_toks = Vec::new();
    let mut frac_toks = Vec::new();
    let mut exp_toks = Vec::new();
    let mut grouping = false;
    let mut scale_commas = 0u32;
    let mut percents = 0u32;

    // Trailing commas immediately after the last digit placeholder (wherever
    // it sits — `#,##0,` and `0.0,,` both scale) divide by 1000 each; interior
    // commas between integer digits enable grouping.
    let last_int_digit = toks
        .iter()
        .enumerate()
        .filter(|(idx, t)| {
            matches!(t, Tok::Digit(_))
                && decimal_pos.is_none_or(|d| *idx < d)
                && exp_pos.is_none_or(|e| *idx < e)
                && fraction.as_ref().is_none_or(|f| *idx < f.start)
        })
        .map(|(idx, _)| idx)
        .last();
    let last_digit_overall = toks
        .iter()
        .enumerate()
        .filter(|(_, t)| matches!(t, Tok::Digit(_)))
        .map(|(idx, _)| idx)
        .last();

    for (idx, t) in toks.iter().enumerate() {
        if let Some(f) = &fraction {
            // Fraction tokens are handled by render_fraction; keep only the prefix.
            if idx >= f.start {
                if matches!(t, Tok::Percent) {
                    percents += 1;
                }
                continue;
            }
        }
        match t {
            Tok::Percent => {
                percents += 1;
                // Percent literal stays positional.
                target_of(
                    idx,
                    decimal_pos,
                    exp_pos,
                    &mut int_toks,
                    &mut frac_toks,
                    &mut exp_toks,
                )
                .push(t);
            }
            Tok::Comma => {
                let is_scaling = match last_digit_overall {
                    Some(last) => {
                        idx > last && toks[last + 1..idx].iter().all(|t| matches!(t, Tok::Comma))
                    }
                    None => false,
                };
                if is_scaling {
                    scale_commas += 1;
                } else if decimal_pos.is_none_or(|d| idx < d)
                    && last_int_digit.is_some_and(|l| idx < l)
                {
                    grouping = true;
                }
                // Commas never render positionally.
            }
            Tok::DecimalPoint if Some(idx) == decimal_pos => {}
            Tok::Exp { .. } => {}
            _ => target_of(
                idx,
                decimal_pos,
                exp_pos,
                &mut int_toks,
                &mut frac_toks,
                &mut exp_toks,
            )
            .push(t),
        }
    }

    NumberLayout {
        int_toks,
        frac_toks,
        exp_toks,
        has_decimal: decimal_pos.is_some(),
        exp: toks.iter().find_map(|t| match t {
            Tok::Exp { show_plus } => Some(*show_plus),
            _ => None,
        }),
        grouping,
        scale_commas,
        percents,
        fraction,
    }
}

fn target_of<'a, 'b>(
    idx: usize,
    decimal_pos: Option<usize>,
    exp_pos: Option<usize>,
    int_toks: &'b mut Vec<&'a Tok>,
    frac_toks: &'b mut Vec<&'a Tok>,
    exp_toks: &'b mut Vec<&'a Tok>,
) -> &'b mut Vec<&'a Tok> {
    if let Some(e) = exp_pos {
        if idx > e {
            return exp_toks;
        }
    }
    match decimal_pos {
        Some(d) if idx > d => frac_toks,
        _ => int_toks,
    }
}

/// `sign_consumed`: the section was selected by the negative role, so the
/// format itself encodes negativity (e.g. parens) and no minus is prepended.
fn render_number(value: f64, section: &Section, locale: &Locale, sign_consumed: bool) -> String {
    let layout = analyze_number_section(section);

    if let Some(frac) = &layout.fraction {
        return render_fraction(value, section, frac, locale, sign_consumed);
    }

    let mut v = value;
    for _ in 0..layout.percents {
        v *= 100.0;
    }
    for _ in 0..layout.scale_commas {
        v /= 1000.0;
    }

    if let Some(show_plus) = layout.exp {
        return render_scientific(v, &layout, show_plus, locale, v < 0.0 && !sign_consumed);
    }

    let frac_decimals = layout
        .frac_toks
        .iter()
        .filter(|t| matches!(t, Tok::Digit(_)))
        .count() as u32;
    let plain = decimal_string(v.abs(), frac_decimals.max(2) + 2);
    let rounded = round_decimal_string(&plain, frac_decimals);
    // A section with no digit placeholders shows literals only — no
    // auto-minus. Otherwise the minus sticks even when the value rounds to
    // display zero (Excel shows "-0", e.g. TEXT(-1,"#,##0,")).
    let has_placeholders = layout
        .int_toks
        .iter()
        .chain(layout.frac_toks.iter())
        .any(|t| matches!(t, Tok::Digit(_)));
    let negative = v < 0.0 && !sign_consumed && has_placeholders;
    let (int_digits_raw, frac_digits) = match rounded.split_once('.') {
        Some((i, f)) => (i.to_string(), f.to_string()),
        None => (rounded, String::new()),
    };

    let mut out = String::new();
    if negative {
        out.push('-');
    }
    out.push_str(&render_int_part(
        &int_digits_raw,
        &layout.int_toks,
        layout.grouping,
        locale,
    ));
    if layout.has_decimal {
        // An explicit decimal point in the format always renders, even when no
        // fraction digit survives: Excel shows "1." for `#.##` of 1 and "."
        // for 0 (matches SSF).
        out.push(locale.decimal);
        out.push_str(&render_frac_part(&frac_digits, &layout.frac_toks));
    }
    out
}

/// Lay integer digits onto the integer token list (right-to-left), inserting
/// grouping separators and preserving literals. Surplus digits attach to the
/// leftmost placeholder.
fn render_int_part(digits: &str, toks: &[&Tok], grouping: bool, locale: &Locale) -> String {
    // A zero integer part only renders where a '0' placeholder demands it
    // ("##" of 0 -> "", "#,##0" of 0 -> "0", "#.0" of 0.5 -> ".5").
    let digits = if digits == "0" { "" } else { digits };
    let placeholder_count = toks.iter().filter(|t| matches!(t, Tok::Digit(_))).count();

    let mut rendered: Vec<String> = vec![String::new(); toks.len()];
    let mut digit_iter = digits.chars().rev();
    let mut placeholder_seen = 0usize;

    for (pos, t) in toks.iter().enumerate().rev() {
        match t {
            Tok::Digit(kind) => {
                placeholder_seen += 1;
                let is_leftmost = placeholder_seen == placeholder_count;
                let mut chunk: Vec<char> = Vec::new();
                if is_leftmost {
                    for d in digit_iter.by_ref() {
                        chunk.push(d);
                    }
                    chunk.reverse();
                } else if let Some(d) = digit_iter.next() {
                    chunk.push(d);
                }
                if chunk.is_empty() {
                    match kind {
                        '0' => chunk.push('0'),
                        '?' => chunk.push(' '),
                        _ => {}
                    }
                }
                rendered[pos] = chunk.into_iter().collect();
            }
            Tok::Literal(s) => rendered[pos] = s.clone(),
            Tok::Percent => rendered[pos] = "%".to_string(),
            _ => {}
        }
    }

    let mut joined: String = rendered.concat();
    if grouping {
        joined = insert_grouping(&joined, locale);
    }
    joined
}

/// Insert grouping separators into the digit prefix of a rendered int part.
/// Operates on the leading run of digits/spaces only (literals like `$` stay put).
fn insert_grouping(s: &str, locale: &Locale) -> String {
    // Find the contiguous digit run (the laid-out number); group within it.
    let chars: Vec<char> = s.chars().collect();
    let Some(first_digit) = chars.iter().position(|c| c.is_ascii_digit()) else {
        return s.to_string();
    };
    let mut last_digit = first_digit;
    for (i, c) in chars.iter().enumerate().skip(first_digit) {
        if c.is_ascii_digit() {
            last_digit = i;
        }
    }
    let run: String = chars[first_digit..=last_digit].iter().collect();
    // Don't group if the run contains non-digits (e.g. spaces from '?').
    if !run.chars().all(|c| c.is_ascii_digit()) {
        return s.to_string();
    }
    let mut grouped = String::new();
    let n = run.len();
    for (i, c) in run.chars().enumerate() {
        if i > 0 && (n - i) % 3 == 0 {
            grouped.push(locale.group);
        }
        grouped.push(c);
    }
    let mut out: String = chars[..first_digit].iter().collect();
    out.push_str(&grouped);
    out.extend(chars[last_digit + 1..].iter());
    out
}

fn render_frac_part(digits: &str, toks: &[&Tok]) -> String {
    let mut out = String::new();
    let mut di = 0;
    let digit_bytes = digits.as_bytes();
    // Trailing '#'/'?' placeholders drop trailing zeros.
    let placeholder_kinds: Vec<char> = toks
        .iter()
        .filter_map(|t| match t {
            Tok::Digit(k) => Some(*k),
            _ => None,
        })
        .collect();
    let mut keep_until = 0usize;
    for (i, _) in placeholder_kinds.iter().enumerate() {
        let digit = digit_bytes.get(i).copied().unwrap_or(b'0');
        if digit != b'0' || placeholder_kinds[i] == '0' {
            keep_until = keep_until.max(i + 1);
        }
    }
    // Re-check: a non-zero digit anywhere keeps everything up to it.
    for i in 0..placeholder_kinds.len() {
        if digit_bytes.get(i).copied().unwrap_or(b'0') != b'0' {
            keep_until = keep_until.max(i + 1);
        }
    }
    for t in toks {
        match t {
            Tok::Digit(kind) => {
                if di < keep_until {
                    out.push(*digit_bytes.get(di).unwrap_or(&b'0') as char);
                } else if *kind == '?' {
                    out.push(' ');
                }
                di += 1;
            }
            Tok::Literal(s) => out.push_str(s),
            Tok::Percent => out.push('%'),
            _ => {}
        }
    }
    // All-`#` and no surviving digit -> nothing (the caller drops the point).
    // `?` placeholders keep their spaces (and the point) for alignment.
    if placeholder_kinds.iter().all(|&k| k == '#') && out.is_empty() {
        return String::new();
    }
    out
}

fn render_scientific(
    value: f64,
    layout: &NumberLayout,
    show_plus: bool,
    locale: &Locale,
    negative: bool,
) -> String {
    let mantissa_decimals = layout
        .frac_toks
        .iter()
        .filter(|t| matches!(t, Tok::Digit(_)))
        .count() as u32;
    let int_placeholders = layout
        .int_toks
        .iter()
        .filter(|t| matches!(t, Tok::Digit(_)))
        .count()
        .max(1) as i32;
    let exp_digits = layout
        .exp_toks
        .iter()
        .filter(|t| matches!(t, Tok::Digit(_)))
        .count()
        .max(1);

    let a = value.abs();
    // Engineering-style: exponent is a multiple of int_placeholders when the
    // integer part has >1 placeholder (e.g. `##0.0E+0` steps by 3).
    let mut exp = if a == 0.0 {
        0
    } else {
        a.log10().floor() as i32
    };
    if int_placeholders > 1 {
        exp = (exp as f64 / int_placeholders as f64).floor() as i32 * int_placeholders;
    }
    let mantissa = if a == 0.0 { 0.0 } else { a / 10f64.powi(exp) };
    let plain = decimal_string(mantissa, mantissa_decimals + 2);
    let mut rounded = round_decimal_string(&plain, mantissa_decimals);
    // Rounding overflow (9.99 -> 10.0 with one int placeholder).
    let int_len = rounded.split('.').next().map(|s| s.len()).unwrap_or(0);
    if int_len > int_placeholders as usize && a != 0.0 {
        exp += if int_placeholders > 1 {
            int_placeholders
        } else {
            1
        };
        let mantissa = a / 10f64.powi(exp);
        rounded = round_decimal_string(
            &decimal_string(mantissa, mantissa_decimals + 2),
            mantissa_decimals,
        );
    }
    let (int_digits, frac_digits) = match rounded.split_once('.') {
        Some((i, f)) => (i.to_string(), f.to_string()),
        None => (rounded, String::new()),
    };
    let mut out = String::new();
    if negative {
        out.push('-');
    }
    out.push_str(&render_int_part(
        &int_digits,
        &layout.int_toks,
        false,
        locale,
    ));
    if layout.has_decimal {
        let f = render_frac_part(&frac_digits, &layout.frac_toks);
        if !f.is_empty() {
            out.push(locale.decimal);
            out.push_str(&f);
        }
    }
    let exp_sign = if exp < 0 {
        "-"
    } else if show_plus {
        "+"
    } else {
        ""
    };
    out.push('E');
    out.push_str(exp_sign);
    out.push_str(&format!(
        "{:0width$}",
        exp.unsigned_abs(),
        width = exp_digits
    ));
    out
}

fn render_fraction(
    value: f64,
    section: &Section,
    spec: &FractionSpec,
    locale: &Locale,
    sign_consumed: bool,
) -> String {
    let negative = value < 0.0 && !sign_consumed;
    let a = value.abs();

    // Integer placeholders before the fraction => mixed number.
    let int_toks: Vec<&Tok> = section.toks[..spec.start]
        .iter()
        .filter(|t| !matches!(t, Tok::Comma | Tok::Percent))
        .collect();
    let has_int_part = int_toks.iter().any(|t| matches!(t, Tok::Digit(_)));

    let (whole, frac_value) = if has_int_part {
        (a.trunc() as u64, a.fract())
    } else {
        (0, a)
    };

    let max_den: u64 = spec.fixed_denominator.unwrap_or_else(|| {
        10u64
            .pow(spec.den_placeholders as u32)
            .saturating_sub(1)
            .max(1)
    });

    let (num, den) = match spec.fixed_denominator {
        Some(d) => (((frac_value * d as f64).round()) as u64, d),
        None => best_fraction(frac_value, max_den),
    };

    let (whole, num) = if num == den && den > 0 {
        (whole + 1, 0)
    } else {
        (whole, num)
    };

    let mut out = String::new();
    if negative {
        out.push('-');
    }
    if has_int_part {
        // The literal separator (usually a space) is part of the prefix toks;
        // no extra separator is inserted here.
        let int_digits = int_digits_string(whole);
        out.push_str(&render_int_part(&int_digits, &int_toks, false, locale));
    }
    if num != 0 || !has_int_part {
        let num_str = int_digits_string(num);
        let den_str = int_digits_string(den);
        let pad_num = spec.num_placeholders.saturating_sub(num_str.len());
        out.push_str(&" ".repeat(pad_num));
        out.push_str(&num_str);
        out.push('/');
        out.push_str(&den_str);
    }
    // Trailing alignment spaces are invisible in the viewer; trim for stable,
    // readable goldens.
    let trimmed = out.trim_end();
    if trimmed.is_empty() {
        "0".to_string()
    } else {
        trimmed.to_string()
    }
}

fn int_digits_string(v: u64) -> String {
    // Integer-only digits; no float formatting involved.
    if v == 0 {
        return "0".to_string();
    }
    let mut digits = Vec::new();
    let mut n = v;
    while n > 0 {
        digits.push(b'0' + (n % 10) as u8);
        n /= 10;
    }
    digits.reverse();
    String::from_utf8(digits).unwrap_or_default()
}

/// Best rational approximation num/den of `x` in [0,1) with den <= max_den.
/// Brute force is fine: max_den <= 999 (3 placeholder digits).
fn best_fraction(x: f64, max_den: u64) -> (u64, u64) {
    let mut best = (0u64, 1u64);
    let mut best_err = x;
    for den in 1..=max_den.max(1) {
        let num = (x * den as f64).round() as u64;
        let err = (x - num as f64 / den as f64).abs();
        if err < best_err - 1e-12 {
            best = (num, den);
            best_err = err;
        }
    }
    best
}

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

/// Convert an Excel serial to date parts. Handles the 1900 Lotus leap-year bug
/// (serial 60 renders as the nonexistent 1900-02-29) and the 1904 system.
fn serial_to_parts(serial: f64, date1904: bool, subsecond_digits: u8) -> Option<DateParts> {
    if serial < 0.0 && !date1904 {
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
    let mut time_units = (time * units_per_day).round();
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

fn render_date(serial: f64, section: &Section, date1904: bool, locale: &Locale) -> String {
    let subsecond_digits = section
        .toks
        .iter()
        .find_map(|t| match t {
            Tok::Date(DateTok::SubSecond(n)) => Some(*n),
            _ => None,
        })
        .unwrap_or(0);
    let Some(parts) = serial_to_parts(serial, date1904, subsecond_digits) else {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fmt(value: f64, format: &str) -> String {
        format_number(value, format, false, &EN_US).text
    }

    fn fmt1904(value: f64, format: &str) -> String {
        format_number(value, format, true, &EN_US).text
    }

    #[test]
    fn basic_numbers() {
        assert_eq!(fmt(1234.5, "#,##0.00"), "1,234.50", "spec headline case");
        assert_eq!(fmt(0.0, "0"), "0");
        assert_eq!(fmt(5.0, "0"), "5");
        assert_eq!(fmt(5.5, "0"), "6", "round half away from zero");
        assert_eq!(fmt(-5.5, "0"), "-6");
        assert_eq!(fmt(2.5, "0"), "3");
        assert_eq!(fmt(1234567.0, "#,##0"), "1,234,567");
        assert_eq!(fmt(0.5, "0.00"), "0.50");
        assert_eq!(fmt(0.5, "#.00"), ".50");
        assert_eq!(fmt(0.0, "##"), "");
        assert_eq!(fmt(0.0, "#,##0"), "0");
        assert_eq!(fmt(12.0, "0000"), "0012");
        assert_eq!(
            fmt(1234.0, "00"),
            "1234",
            "surplus digits extend the leftmost placeholder"
        );
        assert_eq!(fmt(1.45, "0.0"), "1.5"); // ryu-precise rounding
        assert_eq!(fmt(0.125, "0.00"), "0.13");
    }

    #[test]
    fn optional_digits_and_spaces() {
        assert_eq!(fmt(1.2, "0.0#"), "1.2");
        assert_eq!(fmt(1.23, "0.0#"), "1.23");
        assert_eq!(fmt(1.2, "0.00#"), "1.20");
        assert_eq!(fmt(1.0, "0.??"), "1.  ");
        assert_eq!(fmt(1.5, "0.??"), "1.5 ");
        assert_eq!(fmt(7.0, "?"), "7");
    }

    #[test]
    fn percent_and_scaling() {
        assert_eq!(fmt(0.123, "0%"), "12%");
        assert_eq!(fmt(0.123, "0.0%"), "12.3%");
        assert_eq!(fmt(0.1234, "0.00%"), "12.34%");
        assert_eq!(
            fmt(1234567.0, "#,##0,"),
            "1,235",
            "trailing comma scales by 1000"
        );
        assert_eq!(fmt(1234567890.0, "0.0,,"), "1234.6");
        assert_eq!(fmt(12345678900.0, "0.0,,,"), "12.3");
    }

    #[test]
    fn currency_and_literals() {
        assert_eq!(fmt(1234.5, "$#,##0.00"), "$1,234.50");
        assert_eq!(fmt(-1234.5, "$#,##0.00"), "-$1,234.50");
        assert_eq!(fmt(12.0, "0\" units\""), "12 units");
        assert_eq!(fmt(12.0, "\"x\"0"), "x12");
        assert_eq!(fmt(5.0, "0\\h"), "5h");
    }

    #[test]
    fn sections_and_signs() {
        assert_eq!(fmt(5.0, "0.00;(0.00)"), "5.00");
        assert_eq!(
            fmt(-5.0, "0.00;(0.00)"),
            "(5.00)",
            "negative section consumes sign"
        );
        assert_eq!(fmt(0.0, "0.00;(0.00)"), "0.00");
        assert_eq!(fmt(0.0, "0;-0;\"zero\""), "zero");
        assert_eq!(fmt(-3.0, "0;\"neg \"0"), "neg 3");
        // Built-in 6/8 style.
        assert_eq!(fmt(-1234.0, "$#,##0_);[Red]($#,##0)"), "($1,234)");
        let f = format_number(-1234.0, "$#,##0_);[Red]($#,##0)", false, &EN_US);
        assert_eq!(f.color, Some("red"));
        // Underscore pads with a space.
        assert_eq!(fmt(1234.0, "$#,##0_);($#,##0)"), "$1,234 ");
    }

    #[test]
    fn conditions() {
        assert_eq!(fmt(150.0, "[>=100]\"big \"0;\"small \"0"), "big 150");
        assert_eq!(fmt(50.0, "[>=100]\"big \"0;\"small \"0"), "small 50");
        assert_eq!(fmt(-2.0, "[<0]\"neg\";\"pos\""), "neg");
    }

    #[test]
    fn scientific() {
        assert_eq!(fmt(12345.0, "0.00E+00"), "1.23E+04");
        assert_eq!(fmt(0.00012, "0.00E+00"), "1.20E-04");
        assert_eq!(fmt(-12345.0, "0.00E+00"), "-1.23E+04");
        assert_eq!(fmt(12345.0, "0.00E-00"), "1.23E04");
        assert_eq!(fmt(0.00012, "0.00E-00"), "1.20E-04");
        assert_eq!(
            fmt(12345.0, "##0.0E+0"),
            "12.3E+3",
            "engineering exponent steps"
        );
        assert_eq!(fmt(0.0, "0.00E+00"), "0.00E+00");
    }

    #[test]
    fn fractions() {
        assert_eq!(fmt(5.25, "# ?/?"), "5 1/4");
        assert_eq!(fmt(0.5, "# ?/?"), " 1/2");
        assert_eq!(fmt(5.0, "# ?/?"), "5");
        assert_eq!(
            fmt(0.333333333, "# ??/??"),
            "  1/3",
            "numerator padded; trailing spaces trimmed"
        );
        assert_eq!(
            fmt(0.6, "# ?/4"),
            " 2/4",
            "fixed denominator: round numerator"
        );
        assert_eq!(fmt(-5.25, "# ?/?"), "-5 1/4");
        assert_eq!(fmt(1.5, "?/?"), "3/2", "no int part -> improper fraction");
    }

    #[test]
    fn general_formatting() {
        assert_eq!(fmt(0.0, "General"), "0");
        assert_eq!(fmt(5.0, "General"), "5");
        assert_eq!(fmt(-5.5, "General"), "-5.5");
        assert_eq!(fmt(1234.5678, "General"), "1234.5678");
        assert_eq!(
            fmt(0.1 + 0.2, "General"),
            "0.3",
            "11-significant-digit rounding hides FP noise"
        );
        assert_eq!(fmt(99999999999.0, "General"), "99999999999");
        assert_eq!(fmt(100000000000.0, "General"), "1E+11");
        assert_eq!(fmt(0.0001, "General"), "0.0001");
        assert_eq!(fmt(0.00005, "General"), "5E-05");
        assert_eq!(fmt(1234567890123.0, "General"), "1.23457E+12");
    }

    #[test]
    fn dates_basic() {
        // Spec headline: serial 45000 with yyyy-mm-dd renders 2023-03-15.
        assert_eq!(fmt(45000.0, "yyyy-mm-dd"), "2023-03-15");
        assert_eq!(fmt(1.0, "m/d/yy"), "1/1/00");
        assert_eq!(fmt(1.0, "yyyy-mm-dd"), "1900-01-01");
        assert_eq!(fmt(45000.0, "m/d/yyyy"), "3/15/2023");
        assert_eq!(fmt(45000.0, "d-mmm-yy"), "15-Mar-23");
        assert_eq!(fmt(45000.0, "mmmm d, yyyy"), "March 15, 2023");
        assert_eq!(fmt(45000.0, "mmmmm"), "M", "single-letter month");
        assert_eq!(fmt(45000.0, "ddd"), "Wed");
        assert_eq!(fmt(45000.0, "dddd"), "Wednesday");
        let f = format_number(45000.0, "yyyy-mm-dd", false, &EN_US);
        assert!(f.is_date);
    }

    #[test]
    fn lotus_leap_year_bug() {
        assert_eq!(fmt(59.0, "yyyy-mm-dd"), "1900-02-28");
        assert_eq!(fmt(60.0, "yyyy-mm-dd"), "1900-02-29", "the fake leap day");
        assert_eq!(fmt(61.0, "yyyy-mm-dd"), "1900-03-01");
        assert_eq!(fmt(0.0, "m/d/yyyy"), "1/0/1900", "serial zero is day zero");
        // Weekdays follow the Lotus convention: serial 1 is a Sunday.
        assert_eq!(fmt(1.0, "dddd"), "Sunday");
        assert_eq!(fmt(60.0, "dddd"), "Wednesday");
        assert_eq!(
            fmt(61.0, "dddd"),
            "Thursday",
            "real weekday resumes after the fake day"
        );
    }

    #[test]
    fn date_1904_system() {
        assert_eq!(fmt1904(0.0, "yyyy-mm-dd"), "1904-01-01");
        assert_eq!(fmt1904(1.0, "yyyy-mm-dd"), "1904-01-02");
        // Same instant differs by 1462 days between systems.
        assert_eq!(fmt1904(45000.0 - 1462.0, "yyyy-mm-dd"), "2023-03-15");
        assert_eq!(fmt1904(0.0, "dddd"), "Friday", "1904-01-01 was a Friday");
    }

    #[test]
    fn times() {
        assert_eq!(fmt(0.5, "h:mm"), "12:00");
        assert_eq!(fmt(0.5, "h:mm AM/PM"), "12:00 PM");
        assert_eq!(fmt(0.0, "h:mm AM/PM"), "12:00 AM");
        assert_eq!(fmt(0.75, "hh:mm:ss"), "18:00:00");
        assert_eq!(fmt(0.25 + 1.0 / 86400.0, "h:mm:ss"), "6:00:01");
        assert_eq!(fmt(0.526, "h:mm A/P"), "12:37 P");
        // Minute/month disambiguation.
        assert_eq!(fmt(45000.5, "yyyy-mm-dd hh:mm:ss"), "2023-03-15 12:00:00");
        assert_eq!(fmt(0.5209, "mm:ss"), "30:06");
        // Elapsed tokens.
        assert_eq!(fmt(1.5, "[h]:mm"), "36:00");
        assert_eq!(fmt(0.75, "[h]:mm:ss"), "18:00:00");
        assert_eq!(fmt(1.0 / 24.0 / 60.0 * 90.0, "[mm]:ss"), "90:00");
        assert_eq!(fmt(45.0 / 86400.0, "[ss]"), "45");
        // Sub-seconds.
        assert_eq!(fmt(0.5 + 0.25 / 86400.0, "h:mm:ss.00"), "12:00:00.25");
        // Time overflow rolls to the next day.
        assert_eq!(fmt(0.9999999, "h:mm:ss"), "0:00:00");
        assert_eq!(fmt(1.9999999, "yyyy-mm-dd h:mm:ss"), "1900-01-02 0:00:00");
    }

    #[test]
    fn builtin_ids_resolve() {
        assert_eq!(builtin_format(0), Some("General"));
        assert_eq!(builtin_format(2), Some("0.00"));
        assert_eq!(builtin_format(14), Some("m/d/yy"));
        assert_eq!(builtin_format(22), Some("m/d/yy h:mm"));
        assert_eq!(builtin_format(49), Some("@"));
        assert_eq!(
            builtin_format(23),
            None,
            "gap ids fall back to General upstream"
        );
        assert_eq!(builtin_format(50), None);
    }

    #[test]
    fn text_values() {
        assert_eq!(format_text("hi", "General", &EN_US).text, "hi");
        assert_eq!(format_text("hi", "@", &EN_US).text, "hi");
        assert_eq!(
            format_text("hi", "\"pre \"@\" post\"", &EN_US).text,
            "pre hi post"
        );
        // 4th section formats text.
        assert_eq!(format_text("hi", "0;-0;0;\"<\"@\">\"", &EN_US).text, "<hi>");
        // No text section: text passes through.
        assert_eq!(format_text("hi", "0.00", &EN_US).text, "hi");
        assert_eq!(format_text("hi", "General", &EN_US).align, Align::Left);
    }

    #[test]
    fn bool_and_error() {
        assert_eq!(format_bool(true).text, "TRUE");
        assert_eq!(format_bool(false).text, "FALSE");
        assert_eq!(format_bool(true).align, Align::Center);
        assert_eq!(format_error(crate::value::ErrorCode::Div0).text, "#DIV/0!");
    }

    #[test]
    fn colors_and_currency_brackets() {
        let f = format_number(-1.0, "0;[Red]-0", false, &EN_US);
        assert_eq!(f.color, Some("red"));
        assert_eq!(f.text, "-1");
        // [$€-407] style currency tag keeps the symbol.
        assert_eq!(fmt(5.0, "[$\u{20AC}-407] 0.00"), "\u{20AC} 5.00");
        // Unknown [Color47] is ignored.
        assert_eq!(fmt(5.0, "[Color47]0"), "5");
    }

    #[test]
    fn nan_and_infinity_are_errors() {
        assert_eq!(fmt(f64::NAN, "0.00"), "#NUM!");
        assert_eq!(fmt(f64::INFINITY, "General"), "#NUM!");
    }

    #[test]
    fn accounting_formats_do_not_crash() {
        // Builtin 44 — exotic but must produce something stable.
        let t = fmt(1234.5, builtin_format(44).unwrap());
        assert!(t.contains("1,234.50"), "got: {t}");
        let t = fmt(-1234.5, builtin_format(44).unwrap());
        assert!(t.contains("1,234.50") && t.contains('('), "got: {t}");
    }
}
