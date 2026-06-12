//! Sheet-level geometry and the px unit conversions the UI consumes.

use serde::Serialize;

/// Sheet-level geometry. Widths/heights are stored in px using the standard
/// Calibri-11 conversions (width chars -> px via 7px MDW + 5px padding; height
/// pt -> px via 96/72) so the UI layer never re-derives units.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(
    feature = "ts-rs",
    derive(ts_rs::TS),
    ts(export, rename = "SheetGeometry")
)]
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
