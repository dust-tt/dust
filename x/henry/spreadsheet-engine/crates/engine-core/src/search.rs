//! Search v1: case-insensitive linear scan over loaded sheets,
//! capped results, generation counter handled at the RPC layer (stale queries
//! are dropped before reaching the engine).

use std::borrow::Cow;

use serde::Serialize;

use crate::numfmt::{format_bool, format_error};
use crate::value::CellValue;
use crate::viewport::{cell_a1, format_cell};
use crate::workbook::Workbook;

#[derive(Debug, Clone, serde::Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOpts {
    /// Defaults apply when omitted, so both fields are optional on the wire.
    #[cfg_attr(feature = "ts-rs", ts(as = "Option<u32>", optional))]
    pub max_results: u32,
    /// Limit to one sheet (index); None = all loaded sheets.
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub sheet: Option<u32>,
}

impl Default for SearchOpts {
    fn default() -> Self {
        SearchOpts {
            max_results: 1000,
            sheet: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub sheet: u32,
    pub row: u32,
    pub col: u32,
    pub a1: String,
    /// Snippet of the matched display text, capped at 120 chars.
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub hits: Vec<SearchHit>,
    /// True when the scan stopped at `max_results`.
    pub capped: bool,
}

const SNIPPET_CHARS: usize = 120;

pub fn search(workbook: &Workbook, query: &str, opts: &SearchOpts) -> SearchResults {
    let mut results = SearchResults {
        hits: Vec::new(),
        capped: false,
    };
    if query.is_empty() {
        return results;
    }
    let needle = query.to_lowercase();

    for sheet_index in 0..workbook.sheet_count() {
        if let Some(only) = opts.sheet {
            if only as usize != sheet_index {
                continue;
            }
        }
        let Some(sheet) = workbook.sheet(sheet_index) else {
            continue;
        };
        for idx in 0..sheet.values.len() {
            // Fast path: strings/bools/errors match on raw text (borrowed, no
            // allocation); numbers and date serials match on their formatted
            // display text.
            let display: Cow<'_, str> = match sheet.values[idx] {
                CellValue::SharedString(i) => Cow::Borrowed(workbook.shared.get(i).unwrap_or("")),
                CellValue::InlineString(r) => Cow::Borrowed(sheet.inline_str(r)),
                CellValue::Bool(b) => Cow::Owned(format_bool(b).text),
                CellValue::Error(e) => Cow::Owned(format_error(e).text),
                CellValue::Number(_) => Cow::Owned(format_cell(workbook, sheet, idx).text),
            };
            // ASCII fast path: no allocation per scanned cell. Mixed/Unicode
            // text falls back to the exact `str::to_lowercase` semantics
            // (context-sensitive mappings like Greek final sigma included).
            let matched = if display.is_ascii() && needle.is_ascii() {
                contains_ascii_ci(&display, &needle)
            } else {
                display.to_lowercase().contains(&needle)
            };
            if matched {
                results.hits.push(SearchHit {
                    sheet: sheet_index as u32,
                    row: sheet.rows[idx],
                    col: sheet.cols[idx],
                    a1: cell_a1(sheet.rows[idx], sheet.cols[idx]),
                    snippet: snippet_of(&display),
                });
                if results.hits.len() as u32 >= opts.max_results {
                    results.capped = true;
                    return results;
                }
            }
        }
    }
    results
}

/// Case-insensitive ASCII substring check; `needle` must already be
/// lowercase. Naive windows scan — cells are short, and this avoids the
/// per-cell `to_lowercase` allocation of the general path.
fn contains_ascii_ci(haystack: &str, needle: &str) -> bool {
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() {
        return true;
    }
    if n.len() > h.len() {
        return false;
    }
    h.windows(n.len()).any(|w| w.eq_ignore_ascii_case(n))
}

fn snippet_of(s: &str) -> String {
    if s.chars().count() <= SNIPPET_CHARS {
        return s.to_string();
    }
    let truncated: String = s.chars().take(SNIPPET_CHARS).collect();
    format!("{truncated}…")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbook::{OpenOptions, SheetBuilder, SheetSlot, SheetVisibility};

    fn workbook() -> Workbook {
        let mut shared = crate::workbook::SharedStrings::default();
        shared.push("Hello World");
        shared.push("other");
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        b.push_cell(0, 0, CellValue::SharedString(0), 0, None);
        b.push_cell(1, 0, CellValue::SharedString(1), 0, None);
        b.push_cell(2, 0, CellValue::Number(1234.5), 0, None);
        b.push_cell(3, 0, CellValue::Bool(true), 0, None);
        let sref = b.intern("inline hello");
        b.push_cell(4, 0, CellValue::InlineString(sref), 0, None);
        Workbook {
            date1904: false,
            shared,
            styles: Default::default(),
            defined_names: Vec::new(),
            sheets: vec![SheetSlot::Loaded(Box::new(b.finish()))],
            container: None,
            opts: OpenOptions::default(),
            total_cells_loaded: 0,
        }
    }

    #[test]
    fn case_insensitive_and_formatted() {
        let wb = workbook();
        let r = search(&wb, "hello", &SearchOpts::default());
        assert_eq!(r.hits.len(), 2);
        assert_eq!(r.hits[0].a1, "A1");
        assert_eq!(r.hits[1].a1, "A5");

        // Numbers match on formatted text (General here).
        let r = search(&wb, "1234.5", &SearchOpts::default());
        assert_eq!(r.hits.len(), 1);

        let r = search(&wb, "TRUE", &SearchOpts::default());
        assert_eq!(r.hits.len(), 1);
    }

    #[test]
    fn caps_results() {
        let wb = workbook();
        let r = search(
            &wb,
            "o",
            &SearchOpts {
                max_results: 1,
                sheet: None,
            },
        );
        assert_eq!(r.hits.len(), 1);
        assert!(r.capped);
    }

    #[test]
    fn empty_query_no_hits() {
        let wb = workbook();
        assert!(search(&wb, "", &SearchOpts::default()).hits.is_empty());
    }

    #[test]
    fn matches_error_and_bool_cells() {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        b.push_cell(
            0,
            0,
            CellValue::Error(crate::value::ErrorCode::Div0),
            0,
            None,
        );
        b.push_cell(1, 0, CellValue::Bool(false), 0, None);
        let wb = Workbook::from_sheets(
            vec![b.finish()],
            Default::default(),
            Default::default(),
            false,
        );
        // Error cells match on their display text, case-insensitively.
        let r = search(&wb, "#div/0!", &SearchOpts::default());
        assert_eq!(r.hits.len(), 1);
        assert_eq!(r.hits[0].snippet, "#DIV/0!");
        // Bool cells match on TRUE/FALSE display text.
        let r = search(&wb, "false", &SearchOpts::default());
        assert_eq!(r.hits.len(), 1);
        assert_eq!(r.hits[0].a1, "A2");
    }

    #[test]
    fn cap_at_exactly_limit_is_flagged_capped() {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        for row in 0..3 {
            let sref = b.intern("match");
            b.push_cell(row, 0, CellValue::InlineString(sref), 0, None);
        }
        let wb = Workbook::from_sheets(
            vec![b.finish()],
            Default::default(),
            Default::default(),
            false,
        );
        // limit == hit count: the scan stops at the cap and reports capped,
        // even though nothing was actually left out.
        let r = search(
            &wb,
            "match",
            &SearchOpts {
                max_results: 3,
                sheet: None,
            },
        );
        assert_eq!(r.hits.len(), 3);
        assert!(r.capped);
        // limit > hit count: not capped.
        let r = search(
            &wb,
            "match",
            &SearchOpts {
                max_results: 4,
                sheet: None,
            },
        );
        assert_eq!(r.hits.len(), 3);
        assert!(!r.capped);
    }

    #[test]
    fn unicode_case_insensitive() {
        let mut shared = crate::workbook::SharedStrings::default();
        shared.push("CAFÉ Über");
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        b.push_cell(0, 0, CellValue::SharedString(0), 0, None);
        let wb = Workbook {
            date1904: false,
            shared,
            styles: Default::default(),
            defined_names: Vec::new(),
            sheets: vec![SheetSlot::Loaded(Box::new(b.finish()))],
            container: None,
            opts: OpenOptions::default(),
            total_cells_loaded: 0,
        };
        assert_eq!(search(&wb, "café", &SearchOpts::default()).hits.len(), 1);
        assert_eq!(search(&wb, "über", &SearchOpts::default()).hits.len(), 1);
    }

    #[test]
    fn ascii_ci_contains() {
        assert!(contains_ascii_ci("Hello World", "world"));
        assert!(contains_ascii_ci("HELLO", "hello"));
        assert!(contains_ascii_ci("abc", ""));
        assert!(!contains_ascii_ci("ab", "abc"));
        assert!(!contains_ascii_ci("hello", "world"));
    }
}
