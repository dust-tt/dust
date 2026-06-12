//! `xl/worksheets/sheetN.xml`: cells, merges, frozen panes, row/col geometry,
//! hyperlinks. The `<dimension>` element is never trusted (evil files lie);
//! the used range is always recomputed from actual cells.

use quick_xml::events::Event;

use crate::addr::{parse_a1, parse_a1_range, MAX_COLS, MAX_ROWS};
use crate::error::{EngineError, Result};
use crate::style::StyleTable;
use crate::value::{CellValue, ErrorCode};
use crate::workbook::{chars_to_px, pt_to_px, Hyperlink, Sheet, SheetBuilder, SheetVisibility};
use crate::xlsx::container::Relationship;

/// Cap on expanded per-column/per-row geometry overrides, so a hostile
/// `<col min="1" max="16384">` x 1000 cannot balloon memory.
const MAX_GEOMETRY_OVERRIDES: usize = 200_000;

/// URL schemes a hyperlink target may carry into the viewer. Anything else
/// (`javascript:`, `data:`, `vbscript:`, `file:`, ...) is dropped at parse so
/// no consumer can ever render an executable href.
const ALLOWED_HYPERLINK_SCHEMES: [&str; 4] = ["http://", "https://", "mailto:", "ftp://"];

/// Sanitize a hyperlink target: strip ASCII control characters (browsers
/// ignore embedded tab/newline when parsing URLs, so `java\nscript:` would
/// bypass a naive prefix check), trim whitespace, then allow only internal
/// `#location` targets and the scheme allowlist (case-insensitive). Returns
/// `None` to drop the hyperlink (the cell itself is kept).
fn sanitize_hyperlink_target(raw: &str) -> Option<String> {
    let cleaned: String = raw.chars().filter(|c| !c.is_ascii_control()).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('#') {
        return Some(trimmed.to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    if ALLOWED_HYPERLINK_SCHEMES
        .iter()
        .any(|scheme| lower.starts_with(scheme))
    {
        return Some(trimmed.to_string());
    }
    None
}

pub fn parse_sheet(
    xml: &[u8],
    name: String,
    visibility: SheetVisibility,
    max_cells: u32,
    styles: &StyleTable,
    rels: &[Relationship],
) -> Result<Sheet> {
    let _ = styles; // reserved for future shared-formula/style needs
    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut buf = Vec::new();

    let mut builder = SheetBuilder::new(name, visibility, max_cells);
    let mut budget_hit = false;

    // Row/cell cursors for files that omit `r` attributes.
    let mut next_row: u32 = 0;
    let mut current_row: u32 = 0;
    let mut next_col: u32 = 0;

    // Current cell state.
    let mut in_cell = false;
    let mut cell_row: u32 = 0;
    let mut cell_col: u32 = 0;
    let mut cell_type: CellType = CellType::Number;
    let mut cell_style: u32 = 0;
    let mut cell_value: Option<String> = None;
    let mut cell_formula: Option<String> = None;
    let mut capture: Capture = Capture::None;
    let mut inline_text = String::new();

    #[derive(Clone, Copy, PartialEq)]
    enum CellType {
        Number,
        SharedString,
        InlineString,
        FormulaString,
        Bool,
        Error,
        IsoDate,
    }

    #[derive(PartialEq)]
    enum Capture {
        None,
        Value,
        Formula,
        InlineT,
    }

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"row" => {
                    current_row = next_row;
                    let mut height: Option<f64> = None;
                    let mut hidden = false;
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default();
                        match attr.key.as_ref() {
                            b"r" => {
                                if let Ok(r) = value.parse::<u32>() {
                                    if (1..=MAX_ROWS).contains(&r) {
                                        current_row = r - 1;
                                    }
                                }
                            }
                            b"ht" => height = value.parse().ok(),
                            b"hidden" => hidden = &*value == "1" || &*value == "true",
                            _ => {}
                        }
                    }
                    next_row = current_row + 1;
                    next_col = 0;
                    if let Some(h) = height {
                        if builder.dims.row_heights_px.len() < MAX_GEOMETRY_OVERRIDES {
                            builder.dims.row_heights_px.push((current_row, pt_to_px(h)));
                        }
                    }
                    if hidden && builder.dims.hidden_rows.len() < MAX_GEOMETRY_OVERRIDES {
                        builder.dims.hidden_rows.push(current_row);
                    }
                }
                b"c" => {
                    in_cell = true;
                    cell_row = current_row;
                    cell_col = next_col;
                    cell_type = CellType::Number;
                    cell_style = 0;
                    cell_value = None;
                    cell_formula = None;
                    inline_text.clear();
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default();
                        match attr.key.as_ref() {
                            b"r" => {
                                if let Some((r, c)) = parse_a1(&value) {
                                    cell_row = r;
                                    cell_col = c;
                                }
                            }
                            b"t" => {
                                cell_type = match &*value {
                                    "s" => CellType::SharedString,
                                    "inlineStr" => CellType::InlineString,
                                    "str" => CellType::FormulaString,
                                    "b" => CellType::Bool,
                                    "e" => CellType::Error,
                                    "d" => CellType::IsoDate,
                                    _ => CellType::Number,
                                };
                            }
                            b"s" => cell_style = value.parse().unwrap_or(0),
                            _ => {}
                        }
                    }
                    next_col = cell_col + 1;
                }
                b"v" if in_cell => capture = Capture::Value,
                b"f" if in_cell => capture = Capture::Formula,
                b"t" if in_cell && cell_type == CellType::InlineString => {
                    capture = Capture::InlineT
                }
                b"mergeCell" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"ref" {
                            let value = attr.unescape_value().unwrap_or_default();
                            if let Some(range) = parse_a1_range(&value) {
                                if builder.merges.len() < MAX_GEOMETRY_OVERRIDES {
                                    builder.merges.push(range);
                                }
                            }
                        }
                    }
                }
                b"pane" => {
                    let mut x_split = 0u32;
                    let mut y_split = 0u32;
                    let mut frozen = false;
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default();
                        match attr.key.as_ref() {
                            b"xSplit" => {
                                x_split = value.parse::<f64>().map(|v| v as u32).unwrap_or(0)
                            }
                            b"ySplit" => {
                                y_split = value.parse::<f64>().map(|v| v as u32).unwrap_or(0)
                            }
                            b"state" => frozen = &*value == "frozen" || &*value == "frozenSplit",
                            _ => {}
                        }
                    }
                    if frozen {
                        builder.dims.frozen_cols = x_split.min(MAX_COLS);
                        builder.dims.frozen_rows = y_split.min(MAX_ROWS);
                    }
                }
                b"sheetView" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"showGridLines" {
                            let value = attr.unescape_value().unwrap_or_default();
                            builder.show_grid_lines = !(&*value == "0" || &*value == "false");
                        }
                    }
                }
                b"sheetFormatPr" => {
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default();
                        match attr.key.as_ref() {
                            b"defaultRowHeight" => {
                                if let Ok(h) = value.parse::<f64>() {
                                    builder.dims.default_row_height_px = pt_to_px(h);
                                }
                            }
                            b"defaultColWidth" => {
                                if let Ok(w) = value.parse::<f64>() {
                                    builder.dims.default_col_width_px = chars_to_px(w);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                b"col" => {
                    let mut min = 0u32;
                    let mut max = 0u32;
                    let mut width: Option<f64> = None;
                    let mut hidden = false;
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default();
                        match attr.key.as_ref() {
                            b"min" => min = value.parse().unwrap_or(0),
                            b"max" => max = value.parse().unwrap_or(0),
                            b"width" => width = value.parse().ok(),
                            b"hidden" => hidden = &*value == "1" || &*value == "true",
                            _ => {}
                        }
                    }
                    if min >= 1 && max >= min && max <= MAX_COLS {
                        for col in (min - 1)..max {
                            if let Some(w) = width {
                                if builder.dims.col_widths_px.len() >= MAX_GEOMETRY_OVERRIDES {
                                    break;
                                }
                                builder.dims.col_widths_px.push((col, chars_to_px(w)));
                            }
                            if hidden && builder.dims.hidden_cols.len() < MAX_GEOMETRY_OVERRIDES {
                                builder.dims.hidden_cols.push(col);
                            }
                        }
                    }
                }
                b"hyperlink" => {
                    let mut reference = None;
                    let mut rel_id: Option<String> = None;
                    let mut location: Option<String> = None;
                    let mut tooltip: Option<String> = None;
                    for attr in e.attributes().flatten() {
                        let value = attr.unescape_value().unwrap_or_default().into_owned();
                        match attr.key.as_ref() {
                            b"ref" => reference = parse_a1_range(&value),
                            b"r:id" => rel_id = Some(value),
                            b"location" => location = Some(value),
                            b"tooltip" => tooltip = Some(value),
                            _ => {}
                        }
                    }
                    if let Some(range) = reference {
                        let target = rel_id
                            .and_then(|rid| {
                                rels.iter().find(|r| r.id == rid).map(|r| r.target.clone())
                            })
                            .or_else(|| location.map(|l| format!("#{l}")))
                            .and_then(|t| sanitize_hyperlink_target(&t));
                        if let Some(target) = target {
                            if builder.hyperlinks.len() < MAX_GEOMETRY_OVERRIDES {
                                builder.hyperlinks.push(Hyperlink {
                                    range,
                                    target,
                                    tooltip,
                                });
                            }
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Text(t)) => match capture {
                Capture::Value => {
                    let text = t
                        .unescape()
                        .map_err(|e| EngineError::Corrupt(format!("bad cell value: {e}")))?;
                    match &mut cell_value {
                        Some(v) => v.push_str(&text),
                        None => cell_value = Some(text.into_owned()),
                    }
                }
                Capture::Formula => {
                    let text = t.unescape().unwrap_or_default();
                    match &mut cell_formula {
                        Some(f) => f.push_str(&text),
                        None => cell_formula = Some(text.into_owned()),
                    }
                }
                Capture::InlineT => {
                    inline_text.push_str(&t.unescape().unwrap_or_default());
                }
                Capture::None => {}
            },
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"v" | b"f" | b"t" => capture = Capture::None,
                b"c" => {
                    in_cell = false;
                    if !budget_hit && cell_row < MAX_ROWS && cell_col < MAX_COLS {
                        let value = match cell_type {
                            CellType::Number => cell_value
                                .as_deref()
                                .and_then(|v| v.trim().parse::<f64>().ok())
                                .filter(|v| v.is_finite())
                                .map(CellValue::Number),
                            CellType::SharedString => cell_value
                                .as_deref()
                                .and_then(|v| v.trim().parse::<u32>().ok())
                                .map(CellValue::SharedString),
                            CellType::InlineString => {
                                if inline_text.is_empty() {
                                    None
                                } else {
                                    let sref = builder.intern(&inline_text);
                                    Some(CellValue::InlineString(sref))
                                }
                            }
                            CellType::FormulaString | CellType::IsoDate => {
                                cell_value.as_deref().map(|v| {
                                    let sref = builder.intern(v);
                                    CellValue::InlineString(sref)
                                })
                            }
                            CellType::Bool => cell_value
                                .as_deref()
                                .map(|v| CellValue::Bool(v.trim() == "1" || v.trim() == "true")),
                            CellType::Error => cell_value.as_deref().map(|v| {
                                CellValue::Error(
                                    ErrorCode::parse(v.trim()).unwrap_or(ErrorCode::Value),
                                )
                            }),
                        };
                        let formula_ref = cell_formula
                            .take()
                            .filter(|f| !f.is_empty())
                            .map(|f| builder.intern(&f));
                        // Style-only cells (no value, no formula) are skipped:
                        // they don't render and would blow the cell budget on
                        // styled-but-empty regions.
                        if value.is_some() || formula_ref.is_some() {
                            // Formula without a (parseable) cached value
                            // displays as an empty string.
                            let value = value
                                .unwrap_or_else(|| CellValue::InlineString(builder.intern("")));
                            if !builder.push_cell(
                                cell_row,
                                cell_col,
                                value,
                                cell_style,
                                formula_ref,
                            ) {
                                budget_hit = true;
                            }
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("bad worksheet xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    builder.dims.row_heights_px.sort_by_key(|&(r, _)| r);
    builder.dims.row_heights_px.dedup_by_key(|&mut (r, _)| r);
    builder.dims.col_widths_px.sort_by_key(|&(c, _)| c);
    builder.dims.col_widths_px.dedup_by_key(|&mut (c, _)| c);
    builder.dims.hidden_rows.sort_unstable();
    builder.dims.hidden_rows.dedup();
    builder.dims.hidden_cols.sort_unstable();
    builder.dims.hidden_cols.dedup();

    Ok(builder.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbook::SheetVisibility;

    fn parse(xml: &[u8]) -> Sheet {
        parse_sheet(
            xml,
            "test".to_string(),
            SheetVisibility::Visible,
            u32::MAX,
            &StyleTable::default(),
            &[],
        )
        .unwrap()
    }

    #[test]
    fn parses_cell_types_and_geometry() {
        let xml = br#"<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:Z99"/>
  <sheetViews><sheetView showGridLines="0"><pane xSplit="2" ySplit="1" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols><col min="2" max="3" width="20" customWidth="1"/><col min="5" max="5" width="0" hidden="1"/></cols>
  <sheetData>
    <row r="1" ht="30"><c r="A1"><v>42.5</v></c><c r="B1" t="s"><v>0</v></c></row>
    <row r="2" hidden="1">
      <c r="A2" t="b"><v>1</v></c>
      <c r="B2" t="e"><v>#DIV/0!</v></c>
      <c r="C2" t="inlineStr"><is><t>inline!</t></is></c>
      <c r="D2" t="str"><f>CONCAT("a","b")</f><v>ab</v></c>
      <c r="E2" s="1"><f>1+1</f><v>2</v></c>
    </row>
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
</worksheet>"#;
        let sheet = parse(xml);
        assert_eq!(sheet.cell_count(), 7);
        assert!(!sheet.show_grid_lines);
        assert_eq!(sheet.dims.frozen_cols, 2);
        assert_eq!(sheet.dims.frozen_rows, 1);
        assert_eq!(sheet.dims.row_heights_px, vec![(0, 40.0)], "30pt -> 40px");
        assert_eq!(sheet.dims.hidden_rows, vec![1]);
        assert_eq!(
            sheet.dims.col_widths_px,
            vec![(1, 145.0), (2, 145.0), (4, 5.0)]
        );
        assert_eq!(sheet.dims.hidden_cols, vec![4]);
        assert_eq!(sheet.merges.len(), 1);
        // The lying <dimension> (Z99) must not affect the used range.
        assert_eq!(sheet.dims.max_row, 1);
        assert_eq!(sheet.dims.max_col, 4);

        let idx = sheet.row_slice(0, 0, 100);
        assert_eq!(sheet.values[idx.start], CellValue::Number(42.5));
        assert_eq!(sheet.values[idx.start + 1], CellValue::SharedString(0));

        let r2 = sheet.row_slice(1, 0, 100);
        let vals: Vec<_> = sheet.values[r2.clone()].to_vec();
        assert_eq!(vals[0], CellValue::Bool(true));
        assert!(matches!(vals[1], CellValue::Error(ErrorCode::Div0)));
        assert!(matches!(vals[2], CellValue::InlineString(_)));
        // Formula with cached value keeps the cached number and the formula text.
        assert_eq!(vals[4], CellValue::Number(2.0));
        assert_eq!(sheet.formula_at(r2.start + 4), Some("1+1"));
        assert_eq!(sheet.style_idx[r2.start + 4], 1);
    }

    #[test]
    fn cells_without_r_attributes_use_cursors() {
        let xml = br#"<worksheet><sheetData>
<row><c><v>1</v></c><c><v>2</v></c></row>
<row><c><v>3</v></c></row>
</sheetData></worksheet>"#;
        let sheet = parse(xml);
        assert_eq!(sheet.cell_count(), 3);
        assert_eq!(sheet.row_slice(0, 0, 10).len(), 2);
        assert_eq!(sheet.row_slice(1, 0, 10).len(), 1);
    }

    #[test]
    fn hyperlink_scheme_allowlist() {
        // Allowed: http(s), mailto, ftp, internal anchors; case-insensitive.
        for ok in [
            "http://example.com",
            "https://example.com/a?b=1",
            "HTTPS://EXAMPLE.COM",
            "mailto:a@b.c",
            "ftp://host/file",
            "#Sheet2!A1",
        ] {
            assert_eq!(
                sanitize_hyperlink_target(ok).as_deref(),
                Some(ok),
                "{ok} should survive"
            );
        }
        // Whitespace trims; embedded control chars are stripped before the
        // scheme check so they can't smuggle a forbidden scheme through.
        assert_eq!(
            sanitize_hyperlink_target("  https://example.com  ").as_deref(),
            Some("https://example.com")
        );
        assert_eq!(
            sanitize_hyperlink_target("java\nscript:alert(1)"),
            None,
            "control chars must not split a forbidden scheme"
        );
        // Dropped: executable/local schemes in any case, relative targets.
        for bad in [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "\tjavascript:alert(1)",
            "data:text/html,<script>x</script>",
            "vbscript:msgbox(1)",
            "file:///etc/passwd",
            "relative/path.xml",
            "//protocol-relative.example",
            "",
        ] {
            assert_eq!(sanitize_hyperlink_target(bad), None, "{bad:?} should drop");
        }
    }

    #[test]
    fn hyperlinks_resolve_rels_and_drop_unsafe_targets() {
        use crate::xlsx::container::Relationship;
        let xml = br#"<worksheet><sheetData>
<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><v>3</v></c></row>
</sheetData>
<hyperlinks>
  <hyperlink ref="A1" r:id="rId1" tooltip="safe"/>
  <hyperlink ref="B1" r:id="rId2"/>
  <hyperlink ref="C1" location="Sheet2!B2"/>
</hyperlinks>
</worksheet>"#;
        let rels = vec![
            Relationship {
                id: "rId1".to_string(),
                kind:
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
                        .to_string(),
                target: "https://example.com".to_string(),
            },
            Relationship {
                id: "rId2".to_string(),
                kind:
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
                        .to_string(),
                target: "javascript:alert(1)".to_string(),
            },
        ];
        let sheet = parse_sheet(
            xml,
            "t".to_string(),
            SheetVisibility::Visible,
            u32::MAX,
            &StyleTable::default(),
            &rels,
        )
        .unwrap();
        // B1's javascript: target is dropped; the cell itself survives.
        assert_eq!(sheet.cell_count(), 3);
        assert_eq!(sheet.hyperlinks.len(), 2);
        assert_eq!(sheet.hyperlinks[0].target, "https://example.com");
        assert_eq!(sheet.hyperlinks[0].tooltip.as_deref(), Some("safe"));
        assert_eq!(sheet.hyperlinks[1].target, "#Sheet2!B2");
    }

    #[test]
    fn budget_truncates() {
        let xml = br#"<worksheet><sheetData>
<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><v>3</v></c></row>
</sheetData></worksheet>"#;
        let sheet = parse_sheet(
            xml,
            "t".to_string(),
            SheetVisibility::Visible,
            2,
            &StyleTable::default(),
            &[],
        )
        .unwrap();
        assert!(sheet.truncated);
        assert_eq!(sheet.cell_count(), 2);
    }
}
