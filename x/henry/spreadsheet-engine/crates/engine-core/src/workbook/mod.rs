//! Flat workbook model: sparse struct-of-arrays sheets sorted by (row, col),
//! string arenas, interned styles, lazy per-sheet parsing, cell budgets.
//!
//! Split along the natural seams: [`sheet`] (Sheet/SheetBuilder/slots),
//! [`strings`] (shared-string arena), [`dims`] (geometry + unit conversions).
//! Everything re-exports here, so `crate::workbook::X` paths are stable.

mod dims;
mod sheet;
mod strings;

pub use dims::{chars_to_px, pt_to_px, SheetDims};
pub use sheet::{sanitize_sheet_name, Hyperlink, Sheet, SheetBuilder};
pub(crate) use sheet::{PendingSheet, SheetSlot};
pub use strings::SharedStrings;

use std::collections::BTreeMap;

use serde::Serialize;

use crate::error::{BudgetKind, EngineError, Result};
use crate::style::StyleTable;

/// Budgets and knobs, all overridable from `OpenOptions` at the TS boundary
/// (see README · Budgets). Time budgets are enforced via deterministic cell-count
/// checkpoints, not wall clock.
#[derive(Debug, Clone)]
pub struct OpenOptions {
    pub max_bytes: u64,
    pub max_cells_per_sheet: u32,
    pub max_total_cells: u64,
    /// CSV delimiter override; `None` = sniff. Ignored for xlsx.
    pub csv_delimiter: Option<u8>,
}

impl Default for OpenOptions {
    fn default() -> Self {
        OpenOptions {
            max_bytes: 400 * 1024 * 1024,
            max_cells_per_sheet: 2_000_000,
            max_total_cells: 8_000_000,
            csv_delimiter: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub enum SheetVisibility {
    Visible,
    Hidden,
    VeryHidden,
}

/// The workbook. Lives only inside the engine; anything crossing the boundary
/// is a small serialized projection (metadata, viewport slices, search hits).
pub struct Workbook {
    pub date1904: bool,
    pub shared: SharedStrings,
    pub styles: StyleTable,
    pub defined_names: Vec<(String, String)>,
    pub(crate) sheets: Vec<SheetSlot>,
    pub(crate) container: Option<crate::xlsx::Container>,
    pub(crate) opts: OpenOptions,
    pub(crate) total_cells_loaded: u64,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SheetMeta {
    pub index: u32,
    pub name: String,
    pub visibility: SheetVisibility,
    pub loaded: bool,
    pub truncated: bool,
    /// Last row index that still has (possibly partial) data when the sheet
    /// was truncated by a cell budget. Rows from this row on may be missing
    /// cells; render an in-grid "data truncated" affordance there.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub truncated_at_row: Option<u32>,
    pub cell_count: u32,
    /// Used-range row/col counts (0 when empty or not loaded yet).
    pub row_count: u32,
    pub col_count: u32,
    pub frozen_rows: u32,
    pub frozen_cols: u32,
    pub default_row_height_px: f64,
    pub default_col_width_px: f64,
    pub show_grid_lines: bool,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase")]
pub struct WorkbookMeta {
    pub sheets: Vec<SheetMeta>,
    pub date1904: bool,
    pub defined_names: Vec<(String, String)>,
    pub shared_string_count: u32,
    pub style_count: u32,
}

impl Workbook {
    /// Build an in-memory workbook from already-loaded sheets (CSV path,
    /// tests). No container: nothing left to lazy-parse.
    pub fn from_sheets(
        sheets: Vec<Sheet>,
        shared: SharedStrings,
        styles: StyleTable,
        date1904: bool,
    ) -> Workbook {
        let total: u64 = sheets.iter().map(|s| s.cell_count() as u64).sum();
        Workbook {
            date1904,
            shared,
            styles,
            defined_names: Vec::new(),
            sheets: sheets
                .into_iter()
                .map(|s| SheetSlot::Loaded(Box::new(s)))
                .collect(),
            container: None,
            opts: OpenOptions::default(),
            total_cells_loaded: total,
        }
    }

    pub fn sheet_count(&self) -> usize {
        self.sheets.len()
    }

    pub fn sheet(&self, index: usize) -> Option<&Sheet> {
        match self.sheets.get(index) {
            Some(SheetSlot::Loaded(sheet)) => Some(sheet),
            _ => None,
        }
    }

    /// Parse the sheet on first activation, enforcing budgets. Idempotent.
    pub fn activate(&mut self, index: usize) -> Result<&Sheet> {
        if index >= self.sheets.len() {
            return Err(EngineError::Internal(format!(
                "sheet index {index} out of range"
            )));
        }
        if matches!(self.sheets[index], SheetSlot::Loaded(_)) {
            match &self.sheets[index] {
                SheetSlot::Loaded(sheet) => return Ok(sheet),
                SheetSlot::Pending(_) => unreachable!(),
            }
        }
        if self.total_cells_loaded >= self.opts.max_total_cells {
            return Err(EngineError::BudgetExceeded(BudgetKind::Cells));
        }
        let remaining_total = self.opts.max_total_cells - self.total_cells_loaded;
        let budget = self
            .opts
            .max_cells_per_sheet
            .min(remaining_total.min(u32::MAX as u64) as u32);

        let sheet = match &self.sheets[index] {
            SheetSlot::Pending(pending) => {
                let part = pending.part.clone().ok_or_else(|| {
                    EngineError::UnsupportedFormat(format!(
                        "sheet '{}' has no worksheet part",
                        pending.name
                    ))
                })?;
                let container = self.container.as_mut().ok_or_else(|| {
                    EngineError::Internal("no container for lazy sheet".to_string())
                })?;
                let xml = container.read_part(&part)?;
                let rels = container.read_rels_for(&part)?;
                crate::xlsx::sheet_xml::parse_sheet(
                    &xml,
                    pending.name.clone(),
                    pending.visibility,
                    budget,
                    &self.styles,
                    &rels,
                )?
            }
            SheetSlot::Loaded(_) => unreachable!(),
        };
        self.total_cells_loaded += sheet.cell_count() as u64;
        self.sheets[index] = SheetSlot::Loaded(Box::new(sheet));
        match &self.sheets[index] {
            SheetSlot::Loaded(sheet) => Ok(sheet),
            SheetSlot::Pending(_) => unreachable!(),
        }
    }

    /// Activate every sheet (CLI / golden tests). Budget errors on later sheets
    /// are not fatal: those sheets simply stay unloaded, mirroring the
    /// metadata `loaded: false` contract.
    pub fn activate_all(&mut self) -> Result<()> {
        for i in 0..self.sheets.len() {
            match self.activate(i) {
                Ok(_) => {}
                Err(EngineError::BudgetExceeded(_)) => break,
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    pub fn metadata(&self) -> WorkbookMeta {
        let sheets = self
            .sheets
            .iter()
            .enumerate()
            .map(|(i, slot)| match slot {
                SheetSlot::Loaded(s) => SheetMeta {
                    index: i as u32,
                    name: s.name.clone(),
                    visibility: s.visibility,
                    loaded: true,
                    truncated: s.truncated,
                    truncated_at_row: if s.truncated && s.cell_count() > 0 {
                        Some(s.dims.max_row)
                    } else {
                        None
                    },
                    cell_count: s.cell_count(),
                    row_count: if s.cell_count() == 0 {
                        0
                    } else {
                        s.dims.max_row + 1
                    },
                    col_count: if s.cell_count() == 0 {
                        0
                    } else {
                        s.dims.max_col + 1
                    },
                    frozen_rows: s.dims.frozen_rows,
                    frozen_cols: s.dims.frozen_cols,
                    default_row_height_px: s.dims.default_row_height_px,
                    default_col_width_px: s.dims.default_col_width_px,
                    show_grid_lines: s.show_grid_lines,
                },
                SheetSlot::Pending(p) => SheetMeta {
                    index: i as u32,
                    name: p.name.clone(),
                    visibility: p.visibility,
                    loaded: false,
                    truncated: false,
                    truncated_at_row: None,
                    cell_count: 0,
                    // Unknown until activation; `<dimension>` hints are
                    // untrusted (evil corpus lies about extents).
                    row_count: 0,
                    col_count: 0,
                    frozen_rows: 0,
                    frozen_cols: 0,
                    default_row_height_px: pt_to_px(15.0),
                    default_col_width_px: chars_to_px(8.43),
                    show_grid_lines: true,
                },
            })
            .collect();
        WorkbookMeta {
            sheets,
            date1904: self.date1904,
            defined_names: self.defined_names.clone(),
            shared_string_count: self.shared.len() as u32,
            style_count: self.styles.styles.len() as u32,
        }
    }

    /// Subset of the style table referenced by `indices`, as a sorted map.
    pub fn style_subset(
        &self,
        indices: impl IntoIterator<Item = u32>,
    ) -> BTreeMap<u32, &crate::style::ResolvedStyle> {
        indices
            .into_iter()
            .map(|i| (i, self.styles.get(i)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::CellValue;

    fn sheet_with(cells: &[(u32, u32, f64)]) -> Sheet {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        for &(r, c, v) in cells {
            b.push_cell(r, c, CellValue::Number(v), 0, None);
        }
        b.finish()
    }

    #[test]
    fn builder_sorts_and_dedups_last_wins() {
        let sheet = sheet_with(&[(1, 1, 10.0), (0, 0, 1.0), (1, 0, 5.0), (0, 0, 2.0)]);
        assert_eq!(sheet.cell_count(), 3);
        assert_eq!(
            sheet.values[0],
            CellValue::Number(2.0),
            "last write wins on A1"
        );
        assert_eq!(sheet.rows, vec![0, 1, 1]);
        assert_eq!(sheet.cols, vec![0, 0, 1]);
        assert_eq!(sheet.dims.max_row, 1);
        assert_eq!(sheet.dims.max_col, 1);
    }

    #[test]
    fn row_slice_clips_columns() {
        let sheet = sheet_with(&[(2, 1, 1.0), (2, 3, 2.0), (2, 5, 3.0), (4, 0, 4.0)]);
        assert_eq!(sheet.row_slice(2, 0, 10).len(), 3);
        assert_eq!(sheet.row_slice(2, 2, 4).len(), 1);
        assert_eq!(sheet.row_slice(2, 6, 9).len(), 0);
        assert_eq!(sheet.row_slice(3, 0, 10).len(), 0);
        assert_eq!(sheet.row_slice(4, 0, 0).len(), 1);
    }

    #[test]
    fn budget_truncates_in_row_major_prefix() {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, 2);
        assert!(b.push_cell(0, 0, CellValue::Number(1.0), 0, None));
        assert!(b.push_cell(0, 1, CellValue::Number(2.0), 0, None));
        assert!(!b.push_cell(1, 0, CellValue::Number(3.0), 0, None));
        let sheet = b.finish();
        assert!(sheet.truncated);
        assert_eq!(sheet.cell_count(), 2);
    }

    #[test]
    fn unit_conversions() {
        assert_eq!(chars_to_px(8.43), 64.0);
        assert_eq!(pt_to_px(15.0), 20.0);
    }

    #[test]
    fn sheet_name_sanitization() {
        assert_eq!(sanitize_sheet_name("Sales Q1", 0), "Sales Q1");
        assert_eq!(sanitize_sheet_name("", 2), "Sheet3");
        assert_eq!(sanitize_sheet_name("a\u{0}b\nc", 0), "abc");
        assert_eq!(sanitize_sheet_name("   ", 0), "Sheet1");
        let long = "é".repeat(500);
        let s = sanitize_sheet_name(&long, 0);
        assert_eq!(s.chars().count(), 64, "caps by chars, not bytes");
    }

    #[test]
    fn truncated_meta_reports_last_row() {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, 3);
        b.push_cell(0, 0, CellValue::Number(1.0), 0, None);
        b.push_cell(1, 0, CellValue::Number(2.0), 0, None);
        b.push_cell(2, 0, CellValue::Number(3.0), 0, None);
        b.push_cell(3, 0, CellValue::Number(4.0), 0, None);
        let wb = Workbook::from_sheets(
            vec![b.finish()],
            Default::default(),
            StyleTable::default(),
            false,
        );
        let meta = wb.metadata();
        assert!(meta.sheets[0].truncated);
        assert_eq!(meta.sheets[0].truncated_at_row, Some(2));

        // Untruncated sheets carry no marker.
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        b.push_cell(0, 0, CellValue::Number(1.0), 0, None);
        let wb = Workbook::from_sheets(
            vec![b.finish()],
            Default::default(),
            StyleTable::default(),
            false,
        );
        assert_eq!(wb.metadata().sheets[0].truncated_at_row, None);
    }
}
