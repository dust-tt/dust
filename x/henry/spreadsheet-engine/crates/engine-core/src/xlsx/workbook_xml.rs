//! `xl/workbook.xml`: sheet list (order, names, visibility, r:id), 1904 date
//! system flag, defined names.

use quick_xml::events::Event;

use crate::error::{EngineError, Result};
use crate::workbook::{sanitize_sheet_name, SheetVisibility};

#[derive(Debug)]
pub struct WorkbookSheetEntry {
    pub name: String,
    pub visibility: SheetVisibility,
    pub rel_id: Option<String>,
}

#[derive(Debug, Default)]
pub struct WorkbookStructure {
    pub sheets: Vec<WorkbookSheetEntry>,
    pub date1904: bool,
    pub defined_names: Vec<(String, String)>,
}

pub fn parse_workbook_xml(xml: &[u8]) -> Result<WorkbookStructure> {
    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut out = WorkbookStructure::default();
    let mut buf = Vec::new();
    let mut in_defined_name: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"sheet" => {
                    let mut name = String::new();
                    let mut visibility = SheetVisibility::Visible;
                    let mut rel_id = None;
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default().into_owned();
                        match attr.key.as_ref() {
                            b"name" => name = value,
                            b"state" => {
                                visibility = match value.as_str() {
                                    "hidden" => SheetVisibility::Hidden,
                                    "veryHidden" => SheetVisibility::VeryHidden,
                                    _ => SheetVisibility::Visible,
                                }
                            }
                            b"r:id" => rel_id = Some(value),
                            _ => {}
                        }
                    }
                    let name = sanitize_sheet_name(&name, out.sheets.len());
                    out.sheets.push(WorkbookSheetEntry {
                        name,
                        visibility,
                        rel_id,
                    });
                }
                b"workbookPr" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"date1904" {
                            let v = attr.unescape_value().unwrap_or_default();
                            out.date1904 = v == "1" || v == "true";
                        }
                    }
                }
                b"definedName" => {
                    let mut name = String::new();
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"name" {
                            name = attr.unescape_value().unwrap_or_default().into_owned();
                        }
                    }
                    in_defined_name = Some(name);
                }
                _ => {}
            },
            Ok(Event::Text(t)) => {
                if let Some(name) = in_defined_name.take() {
                    let value = t.unescape().unwrap_or_default().into_owned();
                    out.defined_names.push((name, value));
                }
            }
            Ok(Event::End(e)) if e.local_name().as_ref() == b"definedName" => {
                // Empty definedName (no text event).
                if let Some(name) = in_defined_name.take() {
                    out.defined_names.push((name, String::new()));
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("bad workbook.xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sheets_and_flags() {
        let xml = br#"<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr date1904="1"/>
  <sheets>
    <sheet name="First" sheetId="1" r:id="rId1"/>
    <sheet name="Secret" sheetId="2" state="veryHidden" r:id="rId2"/>
  </sheets>
  <definedNames><definedName name="MyRange">First!$A$1:$B$2</definedName></definedNames>
</workbook>"#;
        let s = parse_workbook_xml(xml).unwrap();
        assert!(s.date1904);
        assert_eq!(s.sheets.len(), 2);
        assert_eq!(s.sheets[0].name, "First");
        assert_eq!(s.sheets[0].rel_id.as_deref(), Some("rId1"));
        assert_eq!(s.sheets[1].visibility, SheetVisibility::VeryHidden);
        assert_eq!(
            s.defined_names,
            vec![("MyRange".to_string(), "First!$A$1:$B$2".to_string())]
        );
    }

    #[test]
    fn sheet_names_are_sanitized() {
        let huge = "x".repeat(100_000);
        let xml = format!(
            r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>
<sheet name="{huge}" sheetId="1"/>
<sheet name="evil&#10;name&#9;" sheetId="2"/>
<sheet name="&#1;&#2;" sheetId="3"/>
</sheets></workbook>"#
        );
        let s = parse_workbook_xml(xml.as_bytes()).unwrap();
        assert_eq!(s.sheets[0].name.chars().count(), 64, "capped, not 100k");
        assert_eq!(s.sheets[1].name, "evilname", "control chars stripped");
        assert_eq!(
            s.sheets[2].name, "Sheet3",
            "empty after sanitize -> fallback"
        );
    }
}
