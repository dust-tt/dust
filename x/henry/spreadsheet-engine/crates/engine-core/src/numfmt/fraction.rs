//! Fraction rendering (`# ?/?`-style sections): denominator search and the
//! aligned numerator/denominator layout.

use super::parse::{Section, Tok};
use super::render::{int_digits_string, render_int_part, FractionSpec};
use super::Locale;

pub(super) fn render_fraction(
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

    // Rounding can push the fraction to a whole unit; only roll it into the
    // integer part when the format HAS one ("?/?" of 1.0 stays "1/1").
    let (whole, num) = if num == den && den > 0 && has_int_part {
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
