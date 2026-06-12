//! ECMA-376 / Excel number-format engine.
//!
//! Pure function `(value, format, locale) -> FormattedCell`. Deterministic by
//! construction: no clocks, no float `format!("{}")` (digits come from `ryu`
//! plus explicit fixed-point expansion), en-US locale hardcoded behind a
//! `Locale` table for later extensibility.

use crate::value::ErrorCode;

/// Alignment hint per Excel "General" alignment rules; the cell style's
/// explicit horizontal alignment (if any) overrides this in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
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
/// open without building locale infrastructure.
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

mod date;
mod fraction;
mod parse;
mod render;

pub use render::format_general;

use date::render_date;
use parse::{parse_section, split_sections, CondOp, Section, Tok};
use render::render_number;

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// A format string parsed once, for reuse across many cells. Parsing
/// (`split_sections` + `parse_section`) allocates token vectors and walks a
/// state machine; per-cell re-parsing dominates viewport serialization on
/// formatted sheets, so `StyleTable` caches one `ParsedFormat` per style.
#[derive(Debug, Clone)]
pub struct ParsedFormat {
    sections: Vec<Section>,
    /// Empty / `General`: skip section logic entirely.
    general: bool,
    /// Text fast path (`General`/`@`): text values display as-is.
    text_as_is: bool,
}

impl ParsedFormat {
    pub fn parse(fmt: &str) -> ParsedFormat {
        let general = fmt.is_empty() || fmt == "General";
        let text_as_is = general || fmt == "@";
        let sections = if general {
            Vec::new()
        } else {
            split_sections(fmt).into_iter().map(parse_section).collect()
        };
        ParsedFormat {
            sections,
            general,
            text_as_is,
        }
    }
}

/// Format a number (or date serial — date-ness is decided by the format).
/// One-shot convenience over [`format_number_parsed`]; parses `fmt` each call.
pub fn format_number(value: f64, fmt: &str, date1904: bool, locale: &Locale) -> FormattedCell {
    format_number_parsed(value, &ParsedFormat::parse(fmt), date1904, locale)
}

/// Format a number through a pre-parsed format.
pub fn format_number_parsed(
    value: f64,
    parsed: &ParsedFormat,
    date1904: bool,
    locale: &Locale,
) -> FormattedCell {
    if !value.is_finite() {
        return FormattedCell {
            text: ErrorCode::Num.as_str().to_string(),
            align: Align::Center,
            is_date: false,
            color: None,
        };
    }
    if parsed.general {
        return FormattedCell {
            text: format_general(value, locale),
            align: Align::Right,
            is_date: false,
            color: None,
        };
    }
    let sections = &parsed.sections;
    let (section, negate) = pick_number_section(sections, value);
    // An explicitly empty role section hides the value ("0;;" hides
    // negatives) — but only when the format has other, non-empty sections;
    // a fully empty format string means General.
    if section.toks.is_empty() && sections.len() > 1 {
        return FormattedCell {
            text: String::new(),
            align: Align::Right,
            is_date: false,
            color: section.color,
        };
    }
    if section.is_general || section.toks.is_empty() {
        // General sections keep surrounding literals (`"USD "General`).
        let general = format_general(if negate { value.abs() } else { value }, locale);
        let text = if section.toks.len() > 1 {
            render_text_section(section, &general)
        } else {
            general
        };
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
/// One-shot convenience over [`format_text_parsed`]; parses `fmt` each call.
pub fn format_text(value: &str, fmt: &str, locale: &Locale) -> FormattedCell {
    format_text_parsed(value, &ParsedFormat::parse(fmt), locale)
}

/// Format a text cell value through a pre-parsed format.
pub fn format_text_parsed(value: &str, parsed: &ParsedFormat, _locale: &Locale) -> FormattedCell {
    let make = |text: String, color| FormattedCell {
        text,
        align: Align::Left,
        is_date: false,
        color,
    };
    if parsed.text_as_is {
        return make(value.to_string(), None);
    }
    let sections = &parsed.sections;
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

    #[test]
    fn hostile_fraction_formats_stay_bounded() {
        // Format codes come from attacker-controlled styles.xml: denominator
        // width is clamped so the best-fraction scan cannot hang or overflow.
        assert_eq!(fmt(0.5, "?/????????????????????"), "1/2");
        let t = fmt(0.333333333, "#????????????/????????????");
        assert!(t.contains('/'), "got: {t}");
        assert_eq!(
            fmt(0.5, "# ?/9999999"),
            " 50000/99999",
            "fixed denominator clamped"
        );
        // A fixed denominator too large for u64 fails to parse: no fraction,
        // but also no hang or panic.
        let t = fmt(0.5, "# ?/99999999999999999999");
        assert!(!t.is_empty());
    }

    #[test]
    fn pure_fractions_keep_whole_units() {
        assert_eq!(fmt(1.0, "?/?"), "1/1");
        assert_eq!(fmt(2.0, "?/2"), "4/2");
        // With an integer part, rounding still rolls over.
        assert_eq!(fmt(0.999, "# ?/?"), "1");
    }

    #[test]
    fn empty_sections_hide_values() {
        assert_eq!(
            fmt(-5.0, "0;"),
            "",
            "empty negative section hides the value"
        );
        assert_eq!(fmt(0.0, "0;-0;"), "", "empty zero section hides the value");
        assert_eq!(fmt(5.0, "0;"), "5");
        // A fully empty format string still means General.
        assert_eq!(fmt(5.0, ""), "5");
    }

    #[test]
    fn general_sections_keep_literals() {
        assert_eq!(fmt(5.0, "\"USD \"General"), "USD 5");
        assert_eq!(fmt(5.0, "General\" units\""), "5 units");
    }

    #[test]
    fn out_of_range_serials_render_markers() {
        assert_eq!(fmt(1e300, "yyyy-mm-dd"), "#####");
        assert_eq!(fmt(3_000_000.0, "yyyy-mm-dd"), "#####", "past 9999-12-31");
        assert_eq!(
            fmt(2_958_465.0, "yyyy-mm-dd"),
            "9999-12-31",
            "the last representable day"
        );
        assert_eq!(fmt(-1.0, "yyyy-mm-dd"), "#####");
    }

    #[test]
    fn hostile_a1_refs_are_rejected() {
        // Belongs with addr tests but pinned here too: overflow-length refs.
        assert_eq!(crate::addr::parse_a1("AAAAAAAAAAAAAA1"), None);
        assert_eq!(crate::addr::parse_a1(&"A".repeat(100_000)), None);
    }
}
