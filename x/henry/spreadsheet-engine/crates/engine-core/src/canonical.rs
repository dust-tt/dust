//! Canonical JSON projection of a workbook (see README · Determinism): byte-identical
//! across runs, platforms and native-vs-WASM. Keys sorted (serde_json's map is
//! a BTreeMap), floats via serde_json's ryu, LF-only (no pretty printer), UTF-8.

use serde_json::{json, Map, Value};

use crate::addr::to_a1;
use crate::value::CellValue;
use crate::viewport::format_cell;
use crate::workbook::Workbook;

/// Serialize the workbook (all *loaded* sheets) to canonical JSON. Call
/// `activate_all()` first for a full dump.
pub fn canonical_json(workbook: &Workbook) -> String {
    let meta = workbook.metadata();

    let sheets: Vec<Value> = (0..workbook.sheet_count())
        .map(|i| {
            let sheet_meta = &meta.sheets[i];
            let mut obj = Map::new();
            obj.insert("name".to_string(), json!(sheet_meta.name));
            obj.insert(
                "visibility".to_string(),
                serde_json::to_value(sheet_meta.visibility).unwrap_or(Value::Null),
            );
            obj.insert("loaded".to_string(), json!(sheet_meta.loaded));
            let Some(sheet) = workbook.sheet(i) else {
                return Value::Object(obj);
            };
            obj.insert("truncated".to_string(), json!(sheet.truncated));
            obj.insert("cellCount".to_string(), json!(sheet.cell_count()));
            obj.insert(
                "dims".to_string(),
                serde_json::to_value(&sheet.dims).unwrap_or(Value::Null),
            );
            obj.insert("showGridLines".to_string(), json!(sheet.show_grid_lines));
            obj.insert(
                "merges".to_string(),
                Value::Array(
                    sheet
                        .merges
                        .iter()
                        .map(|m| {
                            json!(format!(
                                "{}:{}",
                                to_a1(m.start_row, m.start_col),
                                to_a1(m.end_row, m.end_col)
                            ))
                        })
                        .collect(),
                ),
            );
            obj.insert(
                "hyperlinks".to_string(),
                Value::Array(
                    sheet
                        .hyperlinks
                        .iter()
                        .map(|h| {
                            json!({
                                "ref": format!(
                                    "{}:{}",
                                    to_a1(h.range.start_row, h.range.start_col),
                                    to_a1(h.range.end_row, h.range.end_col)
                                ),
                                "target": h.target,
                            })
                        })
                        .collect(),
                ),
            );

            let cells: Vec<Value> = (0..sheet.values.len())
                .map(|idx| {
                    let mut cell = Map::new();
                    cell.insert(
                        "a1".to_string(),
                        json!(to_a1(sheet.rows[idx], sheet.cols[idx])),
                    );
                    match sheet.values[idx] {
                        CellValue::Number(n) => {
                            cell.insert("t".to_string(), json!("n"));
                            cell.insert("v".to_string(), json_number(n));
                        }
                        CellValue::SharedString(i) => {
                            cell.insert("t".to_string(), json!("s"));
                            cell.insert(
                                "v".to_string(),
                                json!(workbook.shared.get(i).unwrap_or("")),
                            );
                        }
                        CellValue::InlineString(r) => {
                            cell.insert("t".to_string(), json!("s"));
                            cell.insert("v".to_string(), json!(sheet.inline_str(r)));
                        }
                        CellValue::Bool(b) => {
                            cell.insert("t".to_string(), json!("b"));
                            cell.insert("v".to_string(), json!(b));
                        }
                        CellValue::Error(e) => {
                            cell.insert("t".to_string(), json!("e"));
                            cell.insert("v".to_string(), json!(e.as_str()));
                        }
                    }
                    // Formatted display text: pins numfmt behavior in goldens.
                    cell.insert(
                        "w".to_string(),
                        json!(format_cell(workbook, sheet, idx).text),
                    );
                    if let Some(f) = sheet.formula_at(idx) {
                        cell.insert("f".to_string(), json!(f));
                    }
                    let style = sheet.style_idx[idx];
                    if style != 0 {
                        cell.insert("style".to_string(), json!(style));
                    }
                    Value::Object(cell)
                })
                .collect();
            obj.insert("cells".to_string(), Value::Array(cells));
            Value::Object(obj)
        })
        .collect();

    let root = json!({
        "date1904": workbook.date1904,
        "definedNames": workbook.defined_names,
        "sharedStringCount": workbook.shared.len(),
        "styles": workbook.styles.styles,
        "theme": workbook.styles.theme,
        "sheets": sheets,
    });

    // serde_json::to_string is LF-free (single line); keys are sorted because
    // serde_json's Map is a BTreeMap (preserve_order feature is off).
    let mut out = serde_json::to_string(&root).unwrap_or_else(|_| "{}".to_string());
    out.push('\n');
    out
}

/// Numbers: integral f64 values within safe range serialize as integers so the
/// output is stable and readable (`5` not `5.0`).
fn json_number(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 9.0e15 {
        json!(n as i64)
    } else {
        json!(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbook::{OpenOptions, SheetBuilder, SheetSlot, SheetVisibility};

    #[test]
    fn deterministic_and_sorted() {
        let mut b = SheetBuilder::new("s".to_string(), SheetVisibility::Visible, u32::MAX);
        b.push_cell(0, 0, CellValue::Number(1.5), 0, None);
        b.push_cell(0, 1, CellValue::Number(2.0), 0, None);
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
        let a = canonical_json(&wb);
        let b2 = canonical_json(&wb);
        assert_eq!(a, b2);
        assert!(a.ends_with('\n'));
        assert!(
            a.contains("\"v\":2"),
            "integral floats serialize as integers"
        );
        assert!(a.contains("\"v\":1.5"));
        // Sorted keys: "a1" precedes "t" precedes "v" within a cell object.
        let cell_pos = a.find("\"a1\"").unwrap();
        assert!(a[cell_pos..].find("\"t\"").unwrap() < a[cell_pos..].find("\"v\"").unwrap());
    }
}
