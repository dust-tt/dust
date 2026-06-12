//! Viewport queries: O(cells in rectangle), never O(workbook).
//! Also the kit-shaped row-batch projection used by the React adapter.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::addr::{to_a1, CellRange};
use crate::csv::infer_number;
use crate::numfmt::{self, Align, EN_US};
use crate::style::ResolvedStyle;
use crate::value::CellValue;
use crate::workbook::{Sheet, Workbook};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "lowercase")]
pub enum DisplayMode {
    Value,
    Formula,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ViewportCell {
    pub row: u32,
    pub col: u32,
    pub text: String,
    pub align: Align,
    pub style: u32,
    pub is_date: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub formula: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub color: Option<&'static str>,
    /// Set on the top-left cell of a merge intersecting the viewport.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub merge_span: Option<(u32, u32)>,
    /// True for non-top-left cells covered by a merge.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    #[cfg_attr(feature = "ts-rs", ts(as = "Option<bool>", optional))]
    pub is_merged_secondary: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub hyperlink: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ViewportSlice<'a> {
    pub sheet: u32,
    pub row_start: u32,
    pub row_end: u32,
    pub col_start: u32,
    pub col_end: u32,
    pub cells: Vec<ViewportCell>,
    /// Merges intersecting the rectangle.
    pub merges: Vec<CellRange>,
    /// The slice of the style table actually referenced by `cells`,
    /// serialized straight from the table (no per-call clones).
    pub styles: BTreeMap<u32, &'a ResolvedStyle>,
    /// Row heights / col widths for the range: overrides only, px.
    pub row_heights_px: Vec<(u32, f64)>,
    pub col_widths_px: Vec<(u32, f64)>,
}

/// Format one cell of `sheet` (by parallel-array index) to display text.
/// Formats are parsed once per style via the `StyleTable` cache, not per cell.
pub fn format_cell(workbook: &Workbook, sheet: &Sheet, idx: usize) -> numfmt::FormattedCell {
    let value = sheet.values[idx];
    let style_idx = sheet.style_idx[idx];
    let fmt = workbook.styles.parsed_num_fmt(style_idx);
    match value {
        CellValue::Number(n) => numfmt::format_number_parsed(n, fmt, workbook.date1904, &EN_US),
        CellValue::SharedString(i) => {
            let s = workbook.shared.get(i).unwrap_or("");
            numfmt::format_text_parsed(s, fmt, &EN_US)
        }
        CellValue::InlineString(r) => {
            let s = sheet.inline_str(r);
            let mut formatted = numfmt::format_text_parsed(s, fmt, &EN_US);
            // CSV alignment hint: numeric-looking strings align right.
            if infer_number(s).is_some() {
                formatted.align = Align::Right;
            }
            formatted
        }
        CellValue::Bool(b) => numfmt::format_bool(b),
        CellValue::Error(e) => numfmt::format_error(e),
    }
}

pub fn get_viewport(
    workbook: &Workbook,
    sheet_index: u32,
    rows: (u32, u32),
    cols: (u32, u32),
    mode: DisplayMode,
) -> ViewportSlice<'_> {
    let (r0, r1) = (rows.0.min(rows.1), rows.0.max(rows.1));
    let (c0, c1) = (cols.0.min(cols.1), cols.0.max(cols.1));

    let Some(sheet) = workbook.sheet(sheet_index as usize) else {
        return empty_slice(sheet_index, r0, r1, c0, c1);
    };

    let mut cells = Vec::new();
    let mut style_indices: Vec<u32> = Vec::new();

    // Merges intersecting the viewport; the per-cell merge flags below derive
    // from this list. Merge counts are small (and capped at parse).
    let merges: Vec<CellRange> = sheet
        .merges
        .iter()
        .filter(|m| m.start_row <= r1 && m.end_row >= r0 && m.start_col <= c1 && m.end_col >= c0)
        .copied()
        .collect();

    let merge_lookup = |row: u32, col: u32| -> (Option<(u32, u32)>, bool) {
        for m in &merges {
            if m.contains(row, col) {
                if row == m.start_row && col == m.start_col {
                    return (
                        Some((m.end_row - m.start_row + 1, m.end_col - m.start_col + 1)),
                        false,
                    );
                }
                return (None, true);
            }
        }
        (None, false)
    };

    // Pre-filter hyperlinks to the viewport (like merges above) so the
    // per-cell lookup scans a handful of entries, not the sheet's whole
    // (cap-bounded but potentially large) hyperlink list.
    let hyperlinks: Vec<&crate::workbook::Hyperlink> = sheet
        .hyperlinks
        .iter()
        .filter(|h| {
            h.range.start_row <= r1
                && h.range.end_row >= r0
                && h.range.start_col <= c1
                && h.range.end_col >= c0
        })
        .collect();

    let row_list: Vec<u32> = sheet.rows_in_range(r0, r1).collect();
    for row in row_list {
        let span = sheet.row_slice(row, c0, c1);
        for idx in span {
            let col = sheet.cols[idx];
            let formula = sheet.formula_at(idx).map(|f| f.to_string());
            let formatted = match mode {
                DisplayMode::Value => format_cell(workbook, sheet, idx),
                DisplayMode::Formula => match &formula {
                    Some(f) => numfmt::FormattedCell {
                        text: format!("={f}"),
                        align: Align::Left,
                        is_date: false,
                        color: None,
                    },
                    None => format_cell(workbook, sheet, idx),
                },
            };
            let (merge_span, is_merged_secondary) = merge_lookup(row, col);
            let hyperlink = hyperlinks
                .iter()
                .find(|h| h.range.contains(row, col))
                .map(|h| h.target.clone());
            let style = sheet.style_idx[idx];
            style_indices.push(style);
            cells.push(ViewportCell {
                row,
                col,
                text: formatted.text,
                align: formatted.align,
                style,
                is_date: formatted.is_date,
                formula,
                color: formatted.color,
                merge_span,
                is_merged_secondary,
                hyperlink,
            });
        }
    }

    let styles = workbook.style_subset(style_indices);

    ViewportSlice {
        sheet: sheet_index,
        row_start: r0,
        row_end: r1,
        col_start: c0,
        col_end: c1,
        cells,
        merges,
        styles,
        row_heights_px: sheet
            .dims
            .row_heights_px
            .iter()
            .filter(|(r, _)| *r >= r0 && *r <= r1)
            .copied()
            .collect(),
        col_widths_px: sheet
            .dims
            .col_widths_px
            .iter()
            .filter(|(c, _)| *c >= c0 && *c <= c1)
            .copied()
            .collect(),
    }
}

fn empty_slice<'a>(sheet: u32, r0: u32, r1: u32, c0: u32, c1: u32) -> ViewportSlice<'a> {
    ViewportSlice {
        sheet,
        row_start: r0,
        row_end: r1,
        col_start: c0,
        col_end: c1,
        cells: Vec::new(),
        merges: Vec::new(),
        styles: BTreeMap::new(),
        row_heights_px: Vec::new(),
        col_widths_px: Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Kit-shaped row batches (Extend UI kit `getRowsBatchAsync` contract)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct BatchCell {
    pub col: u32,
    /// Final display string — number formats already applied.
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub formula: Option<String>,
    /// Style table index; the adapter materializes the kit's style objects.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub style: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub merge_span: Option<MergeSpan>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    #[cfg_attr(feature = "ts-rs", ts(as = "Option<bool>", optional))]
    pub is_merged_secondary: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub hyperlink: Option<String>,
    pub align: Align,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct MergeSpan {
    pub row_span: u32,
    pub col_span: u32,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct BatchRow {
    pub index: u32,
    pub cells: Vec<BatchCell>,
}

/// Rows `[start_row, start_row + row_count)`, full used-column width, shaped
/// for the kit. O(cells in the requested rows).
pub fn get_rows_batch(
    workbook: &Workbook,
    sheet_index: u32,
    start_row: u32,
    row_count: u32,
) -> Vec<BatchRow> {
    let Some(sheet) = workbook.sheet(sheet_index as usize) else {
        return Vec::new();
    };
    if row_count == 0 {
        return Vec::new();
    }
    let r1 = start_row.saturating_add(row_count - 1);
    let slice = get_viewport(
        workbook,
        sheet_index,
        (start_row, r1),
        (0, sheet.dims.max_col),
        DisplayMode::Value,
    );

    let mut out: Vec<BatchRow> = Vec::new();
    for cell in slice.cells {
        if out.last().map(|r| r.index) != Some(cell.row) {
            out.push(BatchRow {
                index: cell.row,
                cells: Vec::new(),
            });
        }
        let last = out.last_mut();
        if let Some(row) = last {
            row.cells.push(BatchCell {
                col: cell.col,
                value: cell.text,
                formula: cell.formula,
                style: if cell.style == 0 {
                    None
                } else {
                    Some(cell.style)
                },
                merge_span: cell
                    .merge_span
                    .map(|(row_span, col_span)| MergeSpan { row_span, col_span }),
                is_merged_secondary: cell.is_merged_secondary,
                hyperlink: cell.hyperlink,
                align: cell.align,
            });
        }
    }
    out
}

// Re-exported for search snippets.
pub(crate) fn cell_a1(row: u32, col: u32) -> String {
    to_a1(row, col)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbook::{OpenOptions, SheetBuilder, SheetSlot, SheetVisibility};

    fn workbook_with_cells(cells: &[(u32, u32, CellValue)], merges: Vec<CellRange>) -> Workbook {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        for &(r, c, v) in cells {
            b.push_cell(r, c, v, 0, None);
        }
        b.merges = merges;
        let sheet = b.finish();
        Workbook {
            date1904: false,
            shared: Default::default(),
            styles: Default::default(),
            defined_names: Vec::new(),
            sheets: vec![SheetSlot::Loaded(Box::new(sheet))],
            container: None,
            opts: OpenOptions::default(),
            total_cells_loaded: 0,
        }
    }

    #[test]
    fn viewport_clips_exactly() {
        let wb = workbook_with_cells(
            &[
                (0, 0, CellValue::Number(1.0)),
                (5, 5, CellValue::Number(2.0)),
                (10, 10, CellValue::Number(3.0)),
            ],
            vec![],
        );
        let slice = get_viewport(&wb, 0, (0, 9), (0, 9), DisplayMode::Value);
        assert_eq!(slice.cells.len(), 2);
        assert!(slice.cells.iter().all(|c| c.row <= 9 && c.col <= 9));
    }

    #[test]
    fn merge_flags() {
        let wb = workbook_with_cells(
            &[
                (0, 0, CellValue::Number(1.0)),
                (0, 1, CellValue::Number(2.0)),
            ],
            vec![CellRange {
                start_row: 0,
                start_col: 0,
                end_row: 1,
                end_col: 1,
            }],
        );
        let slice = get_viewport(&wb, 0, (0, 5), (0, 5), DisplayMode::Value);
        let a1 = slice
            .cells
            .iter()
            .find(|c| c.row == 0 && c.col == 0)
            .unwrap();
        assert_eq!(a1.merge_span, Some((2, 2)));
        assert!(!a1.is_merged_secondary);
        let b1 = slice
            .cells
            .iter()
            .find(|c| c.row == 0 && c.col == 1)
            .unwrap();
        assert!(b1.is_merged_secondary);
    }

    #[test]
    fn rows_batch_groups_by_row() {
        let wb = workbook_with_cells(
            &[
                (0, 0, CellValue::Number(1.0)),
                (0, 2, CellValue::Number(2.0)),
                (2, 1, CellValue::Number(3.0)),
            ],
            vec![],
        );
        let rows = get_rows_batch(&wb, 0, 0, 10);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].index, 0);
        assert_eq!(rows[0].cells.len(), 2);
        assert_eq!(rows[1].index, 2);
        assert_eq!(rows[0].cells[0].value, "1");
    }

    #[test]
    fn formula_mode_renders_formula_text() {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        let fref = b.intern("SUM(A1:A2)");
        b.push_cell(0, 0, CellValue::Number(42.0), 0, Some(fref));
        b.push_cell(1, 0, CellValue::Number(7.0), 0, None);
        let wb = Workbook {
            date1904: false,
            shared: Default::default(),
            styles: Default::default(),
            defined_names: Vec::new(),
            sheets: vec![SheetSlot::Loaded(Box::new(b.finish()))],
            container: None,
            opts: OpenOptions::default(),
            total_cells_loaded: 0,
        };
        let slice = get_viewport(&wb, 0, (0, 5), (0, 5), DisplayMode::Formula);
        // Formula cells render `=<formula>` left-aligned; non-formula cells
        // fall back to their formatted value.
        assert_eq!(slice.cells[0].text, "=SUM(A1:A2)");
        assert_eq!(slice.cells[0].align, Align::Left);
        assert_eq!(slice.cells[1].text, "7");

        let value_mode = get_viewport(&wb, 0, (0, 5), (0, 5), DisplayMode::Value);
        assert_eq!(value_mode.cells[0].text, "42");
        assert_eq!(value_mode.cells[0].formula.as_deref(), Some("SUM(A1:A2)"));
    }

    #[test]
    fn out_of_range_sheet_is_empty() {
        let wb = workbook_with_cells(&[], vec![]);
        assert!(get_viewport(&wb, 7, (0, 10), (0, 10), DisplayMode::Value)
            .cells
            .is_empty());
        assert!(get_rows_batch(&wb, 7, 0, 10).is_empty());
    }
}
