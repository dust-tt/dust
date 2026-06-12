//! Format-string parsing: section splitting, tokenization, and the
//! month-vs-minute / sub-second disambiguation passes.

// ---------------------------------------------------------------------------
// Format parsing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DateTok {
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
pub(super) enum Tok {
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
pub(super) enum CondOp {
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
}

#[derive(Debug, Clone)]
pub(super) struct Section {
    pub(super) toks: Vec<Tok>,
    pub(super) color: Option<&'static str>,
    pub(super) condition: Option<(CondOp, f64)>,
    pub(super) has_date: bool,
    pub(super) has_digits: bool,
    pub(super) has_text: bool,
    pub(super) is_general: bool,
    /// Any hour/minute/second/subsecond/AM-PM/elapsed token: decides whether
    /// display rounding may carry into the date. Precomputed at parse so
    /// `render_date` does no per-cell token scans.
    pub(super) has_time: bool,
    /// Width of the `.0+` sub-second placeholder, 0 when absent.
    pub(super) subsecond_digits: u8,
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
pub(super) fn split_sections(fmt: &str) -> Vec<&str> {
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

pub(super) fn parse_section(src: &str) -> Section {
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
    let has_time = toks.iter().any(|t| {
        matches!(
            t,
            Tok::Date(
                DateTok::Hour { .. }
                    | DateTok::Minute { .. }
                    | DateTok::Second { .. }
                    | DateTok::SubSecond(_)
                    | DateTok::AmPm { .. }
                    | DateTok::ElapsedHour(_)
                    | DateTok::ElapsedMinute(_)
                    | DateTok::ElapsedSecond(_)
            )
        )
    });
    let subsecond_digits = toks
        .iter()
        .find_map(|t| match t {
            Tok::Date(DateTok::SubSecond(n)) => Some(*n),
            _ => None,
        })
        .unwrap_or(0);

    Section {
        toks,
        color,
        condition,
        has_date,
        has_digits,
        has_text,
        is_general,
        has_time,
        subsecond_digits,
    }
}

fn run_len(chars: &[char], start: usize, pred: impl Fn(&char) -> bool) -> usize {
    chars[start..].iter().take_while(|c| pred(c)).count()
}
