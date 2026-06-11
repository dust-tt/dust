//! XLSX (SpreadsheetML) parsing: ZIP container + pull-parsed XML parts.

pub mod container;
pub mod shared_strings;
pub mod sheet_xml;
pub mod styles_xml;
pub mod workbook_xml;

pub use container::Container;

use crate::error::{BudgetKind, EngineError, Result};
use crate::workbook::{OpenOptions, PendingSheet, SheetSlot, Workbook};

/// Magic for OLE/CFB containers: legacy `.xls` or encrypted OOXML.
const CFB_MAGIC: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/// Open a workbook from raw bytes. Parses workbook structure, shared strings,
/// styles and theme eagerly (all small); worksheet cells parse lazily on first
/// activation (spec §3.3).
pub fn open_xlsx(bytes: Vec<u8>, opts: OpenOptions) -> Result<Workbook> {
    if bytes.len() as u64 > opts.max_bytes {
        return Err(EngineError::BudgetExceeded(BudgetKind::Bytes));
    }
    if bytes.len() >= 8 && bytes[..8] == CFB_MAGIC {
        // CFB container: encrypted OOXML stores an `EncryptedPackage` stream;
        // otherwise it's a legacy BIFF .xls. Scanning for the stream name
        // (UTF-16LE) is crude but sufficient to pick the right typed error.
        let needle: Vec<u8> = "EncryptedPackage"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        if bytes.windows(needle.len()).any(|w| w == needle) {
            return Err(EngineError::Encrypted);
        }
        return Err(EngineError::UnsupportedFormat(
            "legacy .xls (BIFF) files are not supported".to_string(),
        ));
    }

    let mut container = Container::open(bytes)?;

    let workbook_part = container
        .resolve_workbook_part()?
        .ok_or_else(|| EngineError::Corrupt("missing workbook part".to_string()))?;
    let workbook_xml = container.read_part(&workbook_part)?;
    let structure = workbook_xml::parse_workbook_xml(&workbook_xml)?;

    let rels = container.read_rels_for(&workbook_part)?;

    let shared = match container.find_related_part(&workbook_part, &rels, "sharedStrings") {
        Some(part) => {
            let xml = container.read_part(&part)?;
            shared_strings::parse_shared_strings(&xml)?
        }
        None => Default::default(),
    };

    let theme = match container.find_related_part(&workbook_part, &rels, "theme") {
        Some(part) => {
            let xml = container.read_part(&part)?;
            styles_xml::parse_theme(&xml).unwrap_or_default()
        }
        None => Default::default(),
    };

    let styles = match container.find_related_part(&workbook_part, &rels, "styles") {
        Some(part) => {
            let xml = container.read_part(&part)?;
            styles_xml::parse_styles(&xml, theme)?
        }
        None => crate::style::StyleTable {
            styles: vec![Default::default()],
            theme,
        },
    };

    let mut sheets = Vec::with_capacity(structure.sheets.len());
    for s in structure.sheets {
        let part = s
            .rel_id
            .as_deref()
            .and_then(|rid| rels.iter().find(|r| r.id == rid))
            .filter(|r| r.kind.ends_with("worksheet"))
            .map(|r| container.resolve_relative(&workbook_part, &r.target));
        let dim_hint = None; // Filled from <dimension> only at activation; never trusted.
        sheets.push(SheetSlot::Pending(PendingSheet {
            name: s.name,
            visibility: s.visibility,
            part,
            dim_hint,
        }));
    }

    if sheets.is_empty() {
        return Err(EngineError::Corrupt("workbook has no sheets".to_string()));
    }

    Ok(Workbook {
        date1904: structure.date1904,
        shared,
        styles,
        defined_names: structure.defined_names,
        sheets,
        container: Some(container),
        opts,
        total_cells_loaded: 0,
    })
}
