//! Flat workbook model: sparse struct-of-arrays sheets sorted by (row, col),
//! string arenas, interned styles, lazy per-sheet parsing, cell budgets.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::addr::CellRange;
use crate::error::{BudgetKind, EngineError, Result};
use crate::style::StyleTable;
use crate::value::{CellValue, StrRef};

/// Budgets and knobs, all overridable from `OpenOptions` at the TS boundary
/// (spec §6). Time budgets are enforced via deterministic cell-count
/// checkpoints, not wall clock.
#[derive(Debug, Clone)]
pub struct OpenOptions {
    pub max_bytes: u64,
    pub max_cells_per_sheet: u32,
    pub max_total_cells: u64,
}

impl Default for OpenOptions {
    fn default() -> Self {
        OpenOptions {
            max_bytes: 400 * 1024 * 1024,
            max_cells_per_sheet: 2_000_000,
            max_total_cells: 8_000_000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SheetVisibility {
    Visible,
    Hidden,
    VeryHidden,
}

/// Sheet-level geometry. Widths/heights are stored in px using the standard
/// Calibri-11 conversions (width chars -> px via 7px MDW + 5px padding; height
/// pt -> px via 96/72) so the UI layer never re-derives units.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetDims {
    /// Used range, 0-based inclusive. All zero when the sheet is empty
    /// (`cell_count == 0` disambiguates).
    pub min_row: u32,
    pub min_col: u32,
    pub max_row: u32,
    pub max_col: u32,
    pub frozen_rows: u32,
    pub frozen_cols: u32,
    pub default_row_height_px: f64,
    pub default_col_width_px: f64,
    /// Per-column width overrides in px, sorted by column.
    pub col_widths_px: Vec<(u32, f64)>,
    /// Per-row height overrides in px, sorted by row.
    pub row_heights_px: Vec<(u32, f64)>,
    pub hidden_rows: Vec<u32>,
    pub hidden_cols: Vec<u32>,
}

impl Default for SheetDims {
    fn default() -> Self {
        SheetDims {
            min_row: 0,
            min_col: 0,
            max_row: 0,
            max_col: 0,
            frozen_rows: 0,
            frozen_cols: 0,
            default_row_height_px: pt_to_px(15.0),
            default_col_width_px: chars_to_px(8.43),
            col_widths_px: Vec::new(),
            row_heights_px: Vec::new(),
            hidden_rows: Vec::new(),
            hidden_cols: Vec::new(),
        }
    }
}

/// XLSX column width (in characters of the max-digit width) to pixels, for the
/// default Calibri 11 metrics (MDW = 7px, 5px cell padding).
pub fn chars_to_px(width_chars: f64) -> f64 {
    (width_chars * 7.0 + 5.0).round()
}

/// Row height points to CSS pixels (96 dpi / 72 pt-per-inch).
pub fn pt_to_px(height_pt: f64) -> f64 {
    (height_pt * 96.0 / 72.0).round()
}

/// A hyperlink anchored on a cell range.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hyperlink {
    pub range: CellRange,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tooltip: Option<String>,
}

/// One sheet: sparse parallel arrays sorted by (row, col).
#[derive(Debug, Clone)]
pub struct Sheet {
    pub name: String,
    pub visibility: SheetVisibility,
    pub dims: SheetDims,
    pub merges: Vec<CellRange>,
    pub hyperlinks: Vec<Hyperlink>,
    pub truncated: bool,
    pub show_grid_lines: bool,

    pub(crate) rows: Vec<u32>,
    pub(crate) cols: Vec<u32>,
    pub(crate) values: Vec<CellValue>,
    pub(crate) style_idx: Vec<u32>,
    /// Sparse formula side table: (index into the parallel arrays, formula text
    /// ref). Sorted by index. Cells without formulas pay nothing.
    pub(crate) formulas: Vec<(u32, StrRef)>,
    /// Arena for inline strings and formula texts.
    pub(crate) inline_arena: String,
    /// Rows that have at least one cell, with the start offset of their run in
    /// the parallel arrays: `(row, start)`, sorted by row. The run for entry
    /// `i` ends at entry `i+1`'s start (or `len`).
    pub(crate) row_index: Vec<(u32, u32)>,
}

impl Sheet {
    pub fn cell_count(&self) -> u32 {
        self.rows.len() as u32
    }

    pub fn inline_str(&self, r: StrRef) -> &str {
        &self.inline_arena[r.offset as usize..(r.offset + r.len) as usize]
    }

    /// Range of indices in the parallel arrays for `row`, clipped to columns
    /// `[c0, c1]` (inclusive). Two binary searches; O(log n).
    pub fn row_slice(&self, row: u32, c0: u32, c1: u32) -> std::ops::Range<usize> {
        let entry = match self.row_index.binary_search_by_key(&row, |&(r, _)| r) {
            Ok(i) => i,
            Err(_) => return 0..0,
        };
        let start = self.row_index[entry].1 as usize;
        let end = self
            .row_index
            .get(entry + 1)
            .map(|&(_, s)| s as usize)
            .unwrap_or(self.rows.len());
        let cols = &self.cols[start..end];
        let lo = start + cols.partition_point(|&c| c < c0);
        let hi = start + cols.partition_point(|&c| c <= c1);
        lo..hi
    }

    /// Formula text for the cell at parallel-array index `idx`, if any.
    pub fn formula_at(&self, idx: usize) -> Option<&str> {
        self.formulas
            .binary_search_by_key(&(idx as u32), |&(i, _)| i)
            .ok()
            .map(|pos| {
                let (_, sref) = self.formulas[pos];
                self.inline_str(sref)
            })
    }

    /// All cells in row-major order: `(row, col, value, style_idx)`.
    pub fn cells(&self) -> impl Iterator<Item = (u32, u32, CellValue, u32)> + '_ {
        (0..self.rows.len()).map(move |i| {
            (
                self.rows[i],
                self.cols[i],
                self.values[i],
                self.style_idx[i],
            )
        })
    }

    /// Rows in `[r0, r1]` that contain at least one cell.
    pub fn rows_in_range(&self, r0: u32, r1: u32) -> impl Iterator<Item = u32> + '_ {
        let lo = self.row_index.partition_point(|&(r, _)| r < r0);
        self.row_index[lo..]
            .iter()
            .take_while(move |&&(r, _)| r <= r1)
            .map(|&(r, _)| r)
    }
}

/// Builder used by the XLSX/CSV parsers. Accepts cells in any order, sorts,
/// dedups (last write wins, matching reader convention), then freezes into a
/// `Sheet` with its row index.
pub struct SheetBuilder {
    pub name: String,
    pub visibility: SheetVisibility,
    pub dims: SheetDims,
    pub merges: Vec<CellRange>,
    pub hyperlinks: Vec<Hyperlink>,
    pub show_grid_lines: bool,
    cells: Vec<(u32, u32, CellValue, u32, Option<StrRef>)>,
    inline_arena: String,
    truncated: bool,
    max_cells: u32,
}

impl SheetBuilder {
    pub fn new(name: String, visibility: SheetVisibility, max_cells: u32) -> Self {
        SheetBuilder {
            name,
            visibility,
            dims: SheetDims::default(),
            merges: Vec::new(),
            hyperlinks: Vec::new(),
            show_grid_lines: true,
            cells: Vec::new(),
            inline_arena: String::new(),
            truncated: false,
            max_cells,
        }
    }

    pub fn intern(&mut self, s: &str) -> StrRef {
        let offset = self.inline_arena.len() as u32;
        self.inline_arena.push_str(s);
        StrRef {
            offset,
            len: s.len() as u32,
        }
    }

    /// Returns false once the per-sheet cell budget is hit; the caller should
    /// stop feeding cells (rows arrive in row-major order, so the kept prefix
    /// is row-major — truncation monotonicity depends on this).
    pub fn push_cell(
        &mut self,
        row: u32,
        col: u32,
        value: CellValue,
        style: u32,
        formula: Option<StrRef>,
    ) -> bool {
        if self.cells.len() as u32 >= self.max_cells {
            self.truncated = true;
            return false;
        }
        self.cells.push((row, col, value, style, formula));
        true
    }

    pub fn cell_count(&self) -> u32 {
        self.cells.len() as u32
    }

    pub fn finish(self) -> Sheet {
        let SheetBuilder {
            name,
            visibility,
            mut dims,
            mut merges,
            hyperlinks,
            show_grid_lines,
            mut cells,
            inline_arena,
            truncated,
            ..
        } = self;

        // Stable sort by (row, col); on duplicates keep the last occurrence.
        cells.sort_by_key(|&(r, c, ..)| (r, c));
        cells.dedup_by(|later, earlier| {
            // dedup_by removes `later` (the second arg is kept); we want
            // last-wins, so copy `later` into `earlier` before dropping it.
            if later.0 == earlier.0 && later.1 == earlier.1 {
                *earlier = *later;
                true
            } else {
                false
            }
        });

        let mut rows = Vec::with_capacity(cells.len());
        let mut cols = Vec::with_capacity(cells.len());
        let mut values = Vec::with_capacity(cells.len());
        let mut style_idx = Vec::with_capacity(cells.len());
        let mut formulas = Vec::new();
        let mut row_index: Vec<(u32, u32)> = Vec::new();

        for (i, (r, c, v, s, f)) in cells.iter().enumerate() {
            if row_index.last().map(|&(lr, _)| lr) != Some(*r) {
                row_index.push((*r, i as u32));
            }
            rows.push(*r);
            cols.push(*c);
            values.push(*v);
            style_idx.push(*s);
            if let Some(sref) = f {
                formulas.push((i as u32, *sref));
            }
        }

        if !rows.is_empty() {
            dims.min_row = *rows.first().unwrap_or(&0);
            dims.max_row = *rows.last().unwrap_or(&0);
            dims.min_col = cols.iter().copied().min().unwrap_or(0);
            dims.max_col = cols.iter().copied().max().unwrap_or(0);
        } else {
            dims.min_row = 0;
            dims.max_row = 0;
            dims.min_col = 0;
            dims.max_col = 0;
        }

        merges.sort();

        Sheet {
            name,
            visibility,
            dims,
            merges,
            hyperlinks,
            truncated,
            show_grid_lines,
            rows,
            cols,
            values,
            style_idx,
            formulas,
            inline_arena,
            row_index,
        }
    }
}

/// Shared-string arena: every distinct shared string stored once, contiguously.
#[derive(Debug, Default, Clone)]
pub struct SharedStrings {
    arena: String,
    refs: Vec<StrRef>,
}

impl SharedStrings {
    pub fn push(&mut self, s: &str) {
        let offset = self.arena.len() as u32;
        self.arena.push_str(s);
        self.refs.push(StrRef {
            offset,
            len: s.len() as u32,
        });
    }

    pub fn get(&self, idx: u32) -> Option<&str> {
        let r = self.refs.get(idx as usize)?;
        Some(&self.arena[r.offset as usize..(r.offset + r.len) as usize])
    }

    pub fn len(&self) -> usize {
        self.refs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.refs.is_empty()
    }
}

/// A sheet slot: parsed lazily on first activation (spec §3.3 step 4).
pub(crate) enum SheetSlot {
    Loaded(Box<Sheet>),
    Pending(PendingSheet),
}

pub(crate) struct PendingSheet {
    pub name: String,
    pub visibility: SheetVisibility,
    /// Zip part path, e.g. `xl/worksheets/sheet1.xml`. `None` for sheet kinds
    /// we can't load (e.g. chartsheets).
    pub part: Option<String>,
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
#[serde(rename_all = "camelCase")]
pub struct SheetMeta {
    pub index: u32,
    pub name: String,
    pub visibility: SheetVisibility,
    pub loaded: bool,
    pub truncated: bool,
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
}
