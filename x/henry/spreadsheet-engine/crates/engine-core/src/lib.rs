//! Spreadsheet engine core: XLSX/CSV parsing, flat workbook model, ECMA-376
//! number formatting, viewport queries and search.
//!
//! 100% of engine logic lives here; `engine-wasm` is bindings only. This crate
//! compiles and tests natively (`cargo test`, no wasm) — see the spec §2.1.
//!
//! Determinism contract (§7.1): output is a pure function of input bytes.
//! Forbidden here: `std::time`, randomness, `HashMap` iteration order reaching
//! output, float printing via `format!` (`ryu` only, via `numfmt`/serde_json).

pub mod addr;
pub mod canonical;
pub mod csv;
pub mod error;
pub mod numfmt;
pub mod search;
pub mod style;
pub mod value;
pub mod viewport;
pub mod workbook;
pub mod xlsx;

pub use error::{BudgetKind, EngineError, Result};
pub use workbook::{OpenOptions, Workbook};

/// File kind sniffing: ZIP magic -> xlsx, CFB magic handled inside open_xlsx
/// (encrypted / legacy .xls detection); anything else opens as CSV/TSV.
pub fn open_auto(bytes: Vec<u8>, opts: OpenOptions, file_name: &str) -> Result<Workbook> {
    let looks_zip = bytes.len() >= 4 && &bytes[..2] == b"PK";
    let looks_cfb =
        bytes.len() >= 8 && bytes[..8] == [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    let lower = file_name.to_lowercase();
    if looks_zip
        || looks_cfb
        || lower.ends_with(".xlsx")
        || lower.ends_with(".xlsm")
        || lower.ends_with(".xls")
    {
        xlsx::open_xlsx(bytes, opts)
    } else {
        let sheet_name = file_name.rsplit('/').next().unwrap_or(file_name);
        csv::open_csv(bytes, opts, sheet_name)
    }
}
