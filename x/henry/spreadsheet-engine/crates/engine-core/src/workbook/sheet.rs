//! One sheet: sparse struct-of-arrays storage, the builder that freezes it,
//! and the lazy-activation slot.

use serde::Serialize;

use crate::addr::CellRange;
use crate::value::{CellValue, StrRef};

use super::dims::SheetDims;
use super::SheetVisibility;

/// Excel caps sheet names at 31 chars; we allow a little slack for files from
/// other producers but refuse unbounded names (a 1 MB tab label is pure DoS).
const MAX_SHEET_NAME_CHARS: usize = 64;

/// Sanitize a sheet name for display: strip control characters (including
/// NUL), trim, cap the length, and fall back to `Sheet{n}` (1-based) when
/// nothing legible remains.
pub fn sanitize_sheet_name(raw: &str, index: usize) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_SHEET_NAME_CHARS)
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        format!("Sheet{}", index + 1)
    } else {
        trimmed.to_string()
    }
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

/// A sheet slot: parsed lazily on first activation.
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
