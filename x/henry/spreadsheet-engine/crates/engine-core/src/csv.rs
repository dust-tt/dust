//! CSV/TSV engine (spec §3.6): same `Sheet` model, single sheet.
//! Delimiter sniffing on the first 64 KB; per-column type inference for
//! alignment hints only — displayed text is always the original string.

use crate::error::{BudgetKind, EngineError, Result};
use crate::style::StyleTable;
use crate::value::CellValue;
use crate::workbook::{OpenOptions, SheetBuilder, SheetVisibility, Workbook};

const SNIFF_BYTES: usize = 64 * 1024;
const CANDIDATE_DELIMITERS: [u8; 4] = [b',', b';', b'\t', b'|'];

/// Pick the delimiter whose per-line field count is most consistent (and > 1)
/// over the sniff window. Deterministic: ties break by candidate order.
pub fn sniff_delimiter(bytes: &[u8]) -> u8 {
    let window = &bytes[..bytes.len().min(SNIFF_BYTES)];
    let mut best = (b',', 0u32);
    for &delim in &CANDIDATE_DELIMITERS {
        let mut reader = csv::ReaderBuilder::new()
            .delimiter(delim)
            .has_headers(false)
            .flexible(true)
            .from_reader(window);
        let mut counts: Vec<usize> = Vec::new();
        for record in reader.byte_records().take(50).flatten() {
            counts.push(record.len());
        }
        if counts.is_empty() {
            continue;
        }
        // Score: number of rows agreeing with the modal field count, but only
        // when that count is > 1 (a delimiter that never splits is useless).
        let mut sorted = counts.clone();
        sorted.sort_unstable();
        let mode = sorted[sorted.len() / 2];
        if mode <= 1 {
            continue;
        }
        let agreeing = counts.iter().filter(|&&c| c == mode).count() as u32;
        if agreeing > best.1 {
            best = (delim, agreeing);
        }
    }
    best.0
}

/// Open CSV/TSV bytes as a single-sheet workbook. A UTF-8 BOM is stripped;
/// invalid UTF-8 is replaced (lossy) so hostile bytes can't error the engine.
pub fn open_csv(bytes: Vec<u8>, opts: OpenOptions, sheet_name: &str) -> Result<Workbook> {
    if bytes.len() as u64 > opts.max_bytes {
        return Err(EngineError::BudgetExceeded(BudgetKind::Bytes));
    }
    let content = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(rest) => rest,
        None => &bytes[..],
    };
    let delimiter = sniff_delimiter(content);

    let max_cells = opts
        .max_cells_per_sheet
        .min(opts.max_total_cells.min(u32::MAX as u64) as u32);
    let mut builder =
        SheetBuilder::new(sheet_name.to_string(), SheetVisibility::Visible, max_cells);

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(content);

    let mut row: u32 = 0;
    let mut budget_hit = false;
    let mut record = csv::ByteRecord::new();
    loop {
        match reader.read_byte_record(&mut record) {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("csv parse error: {e}"))),
        }
        if budget_hit {
            break;
        }
        for (col, field) in record.iter().enumerate() {
            if field.is_empty() {
                continue;
            }
            let text = String::from_utf8_lossy(field);
            // Values are always stored as the original string (display
            // fidelity); numericness is a render-time alignment hint via
            // `infer_number`, never a stored conversion.
            let sref = builder.intern(&text);
            let value = CellValue::InlineString(sref);
            if !builder.push_cell(row, col as u32, value, 0, None) {
                budget_hit = true;
                break;
            }
        }
        row = row.saturating_add(1);
    }

    let sheet = builder.finish();
    let mut workbook = Workbook::from_sheets(
        vec![sheet],
        Default::default(),
        StyleTable::default(),
        false,
    );
    workbook.opts = opts;
    Ok(workbook)
}

/// Conservative numeric detection for alignment hints: plain decimal /
/// scientific / thousands-grouped numbers. Never changes displayed text.
pub fn infer_number(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() || t.len() > 32 {
        return None;
    }
    // Reject things parse::<f64> would accept but spreadsheets don't show as
    // numbers ("inf", "nan", hex-ish).
    if !t
        .bytes()
        .all(|b| b.is_ascii_digit() || matches!(b, b'+' | b'-' | b'.' | b'e' | b'E' | b','))
    {
        return None;
    }
    if !t.bytes().any(|b| b.is_ascii_digit()) {
        return None;
    }
    let without_groups = t.replace(',', "");
    without_groups.parse::<f64>().ok().filter(|v| v.is_finite())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cells_of(wb: &Workbook) -> Vec<(u32, u32, String)> {
        let sheet = wb.sheet(0).unwrap();
        (0..sheet.cell_count() as usize)
            .map(|i| {
                let text = match sheet.values[i] {
                    CellValue::InlineString(r) => sheet.inline_str(r).to_string(),
                    ref other => format!("{other:?}"),
                };
                (sheet.rows[i], sheet.cols[i], text)
            })
            .collect()
    }

    #[test]
    fn parses_simple_csv() {
        let wb = open_csv(
            b"a,b,c\n1,2,3\n".to_vec(),
            OpenOptions::default(),
            "data.csv",
        )
        .unwrap();
        let cells = cells_of(&wb);
        assert_eq!(cells.len(), 6);
        assert_eq!(cells[0], (0, 0, "a".to_string()));
        assert_eq!(cells[5], (1, 2, "3".to_string()));
    }

    #[test]
    fn sniffs_semicolons_tabs_pipes() {
        assert_eq!(sniff_delimiter(b"a;b;c\n1;2;3\n"), b';');
        assert_eq!(sniff_delimiter(b"a\tb\tc\n1\t2\t3\n"), b'\t');
        assert_eq!(sniff_delimiter(b"a|b|c\n1|2|3\n"), b'|');
        assert_eq!(sniff_delimiter(b"a,b,c\n1,2,3\n"), b',');
        // Single column: falls back to comma.
        assert_eq!(sniff_delimiter(b"justone\nvalues\n"), b',');
    }

    #[test]
    fn quoting_and_embedded_newlines() {
        let wb = open_csv(
            b"\"a,1\",\"line1\nline2\",\"with \"\"quotes\"\"\"\nx,y,z\n".to_vec(),
            OpenOptions::default(),
            "q.csv",
        )
        .unwrap();
        let cells = cells_of(&wb);
        assert_eq!(cells[0].2, "a,1");
        assert_eq!(cells[1].2, "line1\nline2");
        assert_eq!(cells[2].2, "with \"quotes\"");
        assert_eq!(cells[3], (1, 0, "x".to_string()));
    }

    #[test]
    fn bom_and_crlf() {
        let wb = open_csv(
            b"\xEF\xBB\xBFa,b\r\n1,2\r\n".to_vec(),
            OpenOptions::default(),
            "bom.csv",
        )
        .unwrap();
        let cells = cells_of(&wb);
        assert_eq!(cells[0].2, "a", "BOM stripped");
        assert_eq!(cells.len(), 4);
    }

    #[test]
    fn ragged_rows_and_empty_fields() {
        let wb = open_csv(b"a,b,c\nx\n,,z\n".to_vec(), OpenOptions::default(), "r.csv").unwrap();
        let cells = cells_of(&wb);
        // Empty fields are skipped (sparse model).
        assert_eq!(cells.len(), 5);
        assert_eq!(cells[4], (2, 2, "z".to_string()));
    }

    #[test]
    fn number_inference_is_conservative() {
        assert!(infer_number("123").is_some());
        assert!(infer_number("-1.5e3").is_some());
        assert!(infer_number("1,234.50").is_some());
        assert!(infer_number("inf").is_none());
        assert!(infer_number("NaN").is_none());
        assert!(infer_number("12abc").is_none());
        assert!(infer_number("").is_none());
        assert!(infer_number("2023-01-01").is_none());
    }

    #[test]
    fn budget_truncates() {
        let opts = OpenOptions {
            max_cells_per_sheet: 3,
            ..OpenOptions::default()
        };
        let wb = open_csv(b"a,b\nc,d\ne,f\n".to_vec(), opts, "t.csv").unwrap();
        let sheet = wb.sheet(0).unwrap();
        assert!(sheet.truncated);
        assert_eq!(sheet.cell_count(), 3);
    }
}
