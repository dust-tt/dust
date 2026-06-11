//! Search v1 (spec §3.5): case-insensitive linear scan over loaded sheets,
//! capped results, generation counter handled at the RPC layer (stale queries
//! are dropped before reaching the engine).

use serde::Serialize;

use crate::numfmt::{format_bool, format_error};
use crate::value::CellValue;
use crate::viewport::{cell_a1, format_cell};
use crate::workbook::Workbook;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOpts {
    pub max_results: u32,
    /// Limit to one sheet (index); None = all loaded sheets.
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
            // Fast path: strings/bools/errors match on raw text; numbers and
            // date serials match on their formatted display text.
            let display = match sheet.values[idx] {
                CellValue::SharedString(i) => workbook.shared.get(i).unwrap_or("").to_string(),
                CellValue::InlineString(r) => sheet.inline_str(r).to_string(),
                CellValue::Bool(b) => format_bool(b).text,
                CellValue::Error(e) => format_error(e).text,
                CellValue::Number(_) => format_cell(workbook, sheet, idx).text,
            };
            if display.to_lowercase().contains(&needle) {
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
}
