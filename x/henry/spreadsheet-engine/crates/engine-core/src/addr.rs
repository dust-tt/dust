//! Cell address helpers. Rows/cols are 0-based `u32` everywhere in the engine;
//! A1 notation only appears at parse boundaries and in human-facing output.

/// XLSX hard limits (ECMA-376): 1,048,576 rows x 16,384 cols.
pub const MAX_ROWS: u32 = 1_048_576;
pub const MAX_COLS: u32 = 16_384;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
pub struct CellRange {
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
}

impl CellRange {
    pub fn contains(&self, row: u32, col: u32) -> bool {
        row >= self.start_row && row <= self.end_row && col >= self.start_col && col <= self.end_col
    }
}

/// Parse an A1 cell reference like `BC23` into 0-based (row, col).
pub fn parse_a1(s: &str) -> Option<(u32, u32)> {
    let bytes = s.as_bytes();
    let mut col: u64 = 0;
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
        col = col * 26 + (bytes[i].to_ascii_uppercase() - b'A' + 1) as u64;
        i += 1;
    }
    if i == 0 || i == bytes.len() || col == 0 || col > MAX_COLS as u64 {
        return None;
    }
    let mut row: u64 = 0;
    for &b in &bytes[i..] {
        if !b.is_ascii_digit() {
            return None;
        }
        row = row * 10 + (b - b'0') as u64;
        if row > MAX_ROWS as u64 {
            return None;
        }
    }
    if row == 0 {
        return None;
    }
    Some(((row - 1) as u32, (col - 1) as u32))
}

/// Parse an A1 range like `A1:C3` (or a single cell `B2`, yielding a 1x1 range).
pub fn parse_a1_range(s: &str) -> Option<CellRange> {
    let (first, second) = match s.split_once(':') {
        Some((a, b)) => (parse_a1(a)?, parse_a1(b)?),
        None => {
            let cell = parse_a1(s)?;
            (cell, cell)
        }
    };
    Some(CellRange {
        start_row: first.0.min(second.0),
        start_col: first.1.min(second.1),
        end_row: first.0.max(second.0),
        end_col: first.1.max(second.1),
    })
}

/// 0-based column index to letters (`0 -> A`, `27 -> AB`).
pub fn col_to_letters(col: u32) -> String {
    let mut n = col as i64 + 1;
    let mut out = Vec::new();
    while n > 0 {
        let rem = ((n - 1) % 26) as u8;
        out.push(b'A' + rem);
        n = (n - 1) / 26;
    }
    out.reverse();
    // Safety of from_utf8: bytes are all ASCII A-Z by construction.
    String::from_utf8(out).unwrap_or_default()
}

/// 0-based (row, col) to A1 (`(0,0) -> "A1"`).
pub fn to_a1(row: u32, col: u32) -> String {
    format!("{}{}", col_to_letters(col), row + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a1_round_trip() {
        for (row, col) in [(0, 0), (0, 25), (0, 26), (9, 27), (1_048_575, 16_383)] {
            let a1 = to_a1(row, col);
            assert_eq!(parse_a1(&a1), Some((row, col)), "round-trip {a1}");
        }
        assert_eq!(parse_a1("A1"), Some((0, 0)));
        assert_eq!(parse_a1("XFD1048576"), Some((1_048_575, 16_383)));
        assert_eq!(parse_a1("XFE1"), None, "beyond max col");
        assert_eq!(parse_a1("A0"), None);
        assert_eq!(parse_a1(""), None);
        assert_eq!(parse_a1("12"), None);
        assert_eq!(parse_a1("AB"), None);
    }

    #[test]
    fn range_parse() {
        assert_eq!(
            parse_a1_range("A1:C3"),
            Some(CellRange {
                start_row: 0,
                start_col: 0,
                end_row: 2,
                end_col: 2
            })
        );
        // Reversed corners normalize.
        assert_eq!(parse_a1_range("C3:A1"), parse_a1_range("A1:C3"));
        assert_eq!(
            parse_a1_range("B2"),
            Some(CellRange {
                start_row: 1,
                start_col: 1,
                end_row: 1,
                end_col: 1
            })
        );
        assert_eq!(parse_a1_range("nope"), None);
    }
}
