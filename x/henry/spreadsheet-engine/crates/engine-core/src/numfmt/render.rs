//! Number rendering: General, fixed/scientific layouts, grouping, and the
//! decimal-string helpers everything rounds through (ryu only; no `format!`
//! on floats, per the determinism contract).

use super::fraction::render_fraction;
use super::parse::{Section, Tok};
use super::Locale;

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

pub(super) struct FractionSpec {
    pub(super) num_placeholders: usize,
    pub(super) den_placeholders: usize,
    pub(super) fixed_denominator: Option<u64>,
    /// Index in section toks where the fraction part (numerator start) begins.
    pub(super) start: usize,
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
            // Format codes are attacker-controlled (styles.xml): clamp the
            // denominator width so best_fraction's 1..=10^n scan stays
            // bounded (Excel itself caps fraction precision around here).
            const MAX_FRACTION_PLACEHOLDERS: usize = 4;
            fraction = Some(FractionSpec {
                num_placeholders: num_ph.min(MAX_FRACTION_PLACEHOLDERS),
                den_placeholders: den_ph.min(MAX_FRACTION_PLACEHOLDERS),
                fixed_denominator: fixed.map(|d| d.min(99_999)),
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
pub(super) fn render_number(
    value: f64,
    section: &Section,
    locale: &Locale,
    sign_consumed: bool,
) -> String {
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
pub(super) fn render_int_part(
    digits: &str,
    toks: &[&Tok],
    grouping: bool,
    locale: &Locale,
) -> String {
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

pub(super) fn int_digits_string(v: u64) -> String {
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
