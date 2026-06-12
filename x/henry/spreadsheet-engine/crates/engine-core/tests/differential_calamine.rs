//! Differential test vs calamine (independent oracle): typed cell values
//! and sheet structure must agree on the whole synthetic corpus. Documented
//! exceptions live in `corpus/diff-exceptions.toml` (currently empty — the
//! file shrinking over time is the goal, growing is a review smell).

mod common;

use calamine::{Data, Reader};
use common::{corpus_dir, read_corpus_file};
use engine_core::value::CellValue;

fn exceptions() -> Vec<(String, String)> {
    let path = corpus_dir().join("diff-exceptions.toml");
    let Ok(content) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    // Minimal line format: `file:cell = "reason"`. Parsed leniently.
    content
        .lines()
        .filter_map(|l| {
            let l = l.trim();
            if l.is_empty() || l.starts_with('#') {
                return None;
            }
            let (key, _) = l.split_once('=')?;
            let (file, cell) = key.trim().split_once(':')?;
            Some((file.trim().to_string(), cell.trim().to_string()))
        })
        .collect()
}

/// Whole-file oracle exceptions. calamine materializes worksheet ranges
/// densely, so a sheet with cells at the XLSX extents (1,048,576 x 16,384)
/// OOMs it — exactly the failure mode the sparse engine model avoids. The
/// file stays covered by goldens + the generator-model differential.
const CALAMINE_SKIP: &[&str] = &["extremes.xlsx"];

#[test]
fn values_match_calamine() {
    let excepted = exceptions();
    for f in corpus_gen::corpus::build_all() {
        if CALAMINE_SKIP.contains(&f.name) {
            continue;
        }
        let bytes = read_corpus_file(&format!("gen/{}", f.name));

        let mut engine =
            engine_core::open_auto(bytes.clone(), engine_core::OpenOptions::default(), f.name)
                .expect("engine open");
        engine.activate_all().expect("engine activate");

        let cursor = std::io::Cursor::new(bytes);
        let mut cala: calamine::Xlsx<_> = calamine::Xlsx::new(cursor).expect("calamine open");

        let sheet_names = cala.sheet_names().to_vec();
        assert_eq!(
            sheet_names.len(),
            engine.sheet_count(),
            "{}: sheet count vs calamine",
            f.name
        );

        for (sheet_index, sheet_name) in sheet_names.iter().enumerate() {
            let range = cala.worksheet_range(sheet_name).expect("calamine range");
            let engine_sheet = engine.sheet(sheet_index).expect("engine sheet loaded");
            assert_eq!(&engine_sheet.name, sheet_name, "{}: sheet name", f.name);

            // Build the engine cell map for this sheet.
            let mut engine_cells: std::collections::BTreeMap<(u32, u32), String> =
                Default::default();
            for (r, c, value, _style) in engine_sheet.cells() {
                let v = match value {
                    CellValue::Number(n) => format_num(n),
                    CellValue::SharedString(i) => {
                        format!("s:{}", engine.shared.get(i).unwrap_or(""))
                    }
                    CellValue::InlineString(sr) => format!("s:{}", engine_sheet.inline_str(sr)),
                    CellValue::Bool(b) => format!("b:{b}"),
                    CellValue::Error(e) => format!("e:{}", e.as_str()),
                };
                engine_cells.insert((r, c), v);
            }

            let mut calamine_count = 0usize;
            // calamine cell positions are relative to the range start.
            let (range_row, range_col) = range.start().unwrap_or((0, 0));
            for (row, col, cell) in range.used_cells() {
                let key = (range_row + row as u32, range_col + col as u32);
                let a1 = engine_core::addr::to_a1(key.0, key.1);
                if excepted.iter().any(|(ef, ec)| ef == f.name && *ec == a1) {
                    // Excepted cells still count toward the cell-coverage
                    // assertion below (the engine usually has the cell, just
                    // with a documented value disagreement).
                    calamine_count += 1;
                    continue;
                }
                let expected = match cell {
                    Data::Int(i) => format_num(*i as f64),
                    Data::Float(v) => format_num(*v),
                    Data::String(s) => format!("s:{s}"),
                    Data::Bool(b) => format!("b:{b}"),
                    Data::Error(e) => format!("e:{e}"),
                    Data::DateTime(dt) => format_num(dt.as_f64()),
                    Data::DateTimeIso(s) | Data::DurationIso(s) => format!("s:{s}"),
                    Data::Empty => continue,
                };
                calamine_count += 1;
                match engine_cells.get(&key) {
                    Some(actual) => assert_eq!(
                        actual, &expected,
                        "{} {} ({a1}): engine vs calamine",
                        f.name, sheet_name
                    ),
                    None => panic!(
                        "{} {} ({a1}): calamine sees {expected}, engine has no cell",
                        f.name, sheet_name
                    ),
                }
            }

            // Engine may have strictly more cells only for formula-without-value
            // cells (calamine drops those); everything else must be matched.
            let formula_only = engine_cells
                .iter()
                .filter(|((r, c), v)| {
                    v.as_str() == "s:" && {
                        let span = engine_sheet.row_slice(*r, *c, *c);
                        span.into_iter()
                            .any(|i| engine_sheet.formula_at(i).is_some())
                    }
                })
                .count();
            assert!(
                engine_cells.len() <= calamine_count + formula_only,
                "{} {}: engine has {} cells, calamine {} (+{} formula-only)",
                f.name,
                sheet_name,
                engine_cells.len(),
                calamine_count,
                formula_only
            );
        }
    }
}

/// Canonical numeric comparison via ryu, so 2.0 == 2 and float noise can't
/// produce false mismatches between the two readers.
fn format_num(v: f64) -> String {
    let mut buf = ryu::Buffer::new();
    format!("n:{}", buf.format(v))
}
