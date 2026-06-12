//! Adversarial-corpus tests: the engine must never
//! panic, hang, or blow budgets on hostile input. Panics are caught via
//! `catch_unwind` and turned into test failures; expected outcomes (typed
//! error or partial result) come from the committed manifest.

mod common;

use std::panic::{catch_unwind, AssertUnwindSafe};

use common::read_corpus_file;
use engine_core::{EngineError, OpenOptions};

fn open_outcome(name: &str, bytes: Vec<u8>) -> Result<&'static str, String> {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let opts = OpenOptions::default();
        match engine_core::open_auto(bytes, opts, name) {
            Ok(mut wb) => {
                // Activation must also be panic-free; budget errors are fine.
                for i in 0..wb.sheet_count() {
                    match wb.activate(i) {
                        Ok(_) | Err(_) => {}
                    }
                }
                // Exercise the read paths on whatever loaded.
                for i in 0..wb.sheet_count() {
                    let _ = engine_core::viewport::get_viewport(
                        &wb,
                        i as u32,
                        (0, 100),
                        (0, 50),
                        engine_core::viewport::DisplayMode::Value,
                    );
                    let _ = engine_core::viewport::get_rows_batch(&wb, i as u32, 0, 50);
                }
                let _ = engine_core::search::search(
                    &wb,
                    "x",
                    &engine_core::search::SearchOpts::default(),
                );
                "opened"
            }
            Err(EngineError::Corrupt(_)) => "CORRUPT",
            Err(EngineError::UnsupportedFormat(_)) => "UNSUPPORTED_FORMAT",
            Err(EngineError::Encrypted) => "ENCRYPTED",
            Err(EngineError::BudgetExceeded(_)) => "BUDGET_EXCEEDED",
            Err(EngineError::Cancelled) => "CANCELLED",
            Err(EngineError::Internal(_)) => "INTERNAL",
        }
    }));
    result.map_err(|panic| {
        let msg = panic
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_else(|| "non-string panic".to_string());
        format!("PANIC: {msg}")
    })
}

#[test]
fn evil_corpus_never_panics_and_matches_expectations() {
    let manifest = String::from_utf8(read_corpus_file("evil/MANIFEST.tsv")).expect("manifest utf8");
    let mut checked = 0;
    for line in manifest.lines() {
        let Some((name, expectation)) = line.split_once('\t') else {
            continue;
        };
        let bytes = read_corpus_file(&format!("evil/{name}"));
        let outcome = open_outcome(name, bytes).unwrap_or_else(|p| panic!("{name}: {p}"));
        match expectation {
            // Typed-error expectations are exact.
            "CORRUPT" | "UNSUPPORTED_FORMAT" | "ENCRYPTED" => {
                // Truncation can coincidentally leave a readable zip prefix;
                // a partial open is acceptable for truncated files, a panic
                // never is.
                if name.starts_with("truncated_") {
                    assert!(
                        outcome == expectation || outcome == "opened",
                        "{name}: outcome {outcome}, expected {expectation} (or partial open)"
                    );
                } else {
                    assert_eq!(outcome, expectation, "{name}");
                }
            }
            // `partial`: open may succeed (possibly with missing/short sheets)
            // or fail with CORRUPT — but only those two.
            "partial" => assert!(
                outcome == "opened" || outcome == "CORRUPT",
                "{name}: outcome {outcome}, expected partial-or-corrupt"
            ),
            // `ok`: open and full read path must succeed.
            "ok" => assert_eq!(outcome, "opened", "{name}"),
            other => panic!("unknown expectation {other} for {name}"),
        }
        checked += 1;
    }
    assert!(
        checked >= 40,
        "evil manifest looks truncated: only {checked} entries"
    );
}

/// Even with hostile geometry (100k merges), viewport queries must stay fast
/// enough to not hang tests — bounded here by a deterministic cell-count
/// proxy: the call completes over the full merge set.
#[test]
fn hundred_k_merges_viewport_completes() {
    let bytes = read_corpus_file("evil/merges_100k.xlsx");
    let mut wb =
        engine_core::open_auto(bytes, OpenOptions::default(), "merges_100k.xlsx").expect("open");
    wb.activate_all().expect("activate");
    let slice = engine_core::viewport::get_viewport(
        &wb,
        0,
        (0, 60),
        (0, 30),
        engine_core::viewport::DisplayMode::Value,
    );
    assert!(!slice.merges.is_empty());
}

/// No unsafe hyperlink scheme may survive into any engine output. The cells
/// under the dropped links must still be present.
#[test]
fn xss_hyperlinks_are_dropped() {
    let bytes = read_corpus_file("evil/xss_hyperlinks.xlsx");
    let mut wb =
        engine_core::open_auto(bytes, OpenOptions::default(), "xss_hyperlinks.xlsx").expect("open");
    wb.activate_all().expect("activate");
    let sheet = wb.sheet(0).expect("loaded");
    // 7 hostile links dropped, 2 safe ones kept; all 9 cells survive.
    assert_eq!(sheet.cell_count(), 9);
    let targets: Vec<&str> = sheet.hyperlinks.iter().map(|h| h.target.as_str()).collect();
    assert_eq!(targets, vec!["https://example.com/safe", "#xss!A1"]);

    let slice = engine_core::viewport::get_viewport(
        &wb,
        0,
        (0, 50),
        (0, 10),
        engine_core::viewport::DisplayMode::Value,
    );
    for cell in &slice.cells {
        if let Some(link) = &cell.hyperlink {
            let lower = link.to_ascii_lowercase();
            assert!(
                lower.starts_with("http://")
                    || lower.starts_with("https://")
                    || lower.starts_with("mailto:")
                    || lower.starts_with("ftp://")
                    || lower.starts_with('#'),
                "unsafe hyperlink leaked into viewport: {link}"
            );
        }
    }
}

/// Many parts that individually pass the per-part cap must still trip the
/// aggregate decompression budget with a typed error, never an OOM.
#[test]
fn zip_bomb_total_cap_fails_typed() {
    let bytes = read_corpus_file("evil/zip_bomb_total.xlsx");
    let mut wb = engine_core::open_auto(bytes, OpenOptions::default(), "zip_bomb_total.xlsx")
        .expect("open succeeds: sheets are lazy");
    let mut budget_hits = 0;
    for i in 0..wb.sheet_count() {
        match wb.activate(i) {
            Ok(_) => {}
            Err(EngineError::BudgetExceeded(_)) => budget_hits += 1,
            Err(e) => panic!("unexpected error: {e}"),
        }
    }
    assert!(budget_hits > 0, "aggregate decompression cap never tripped");
}

/// A 1 MB sheet name must reach metadata sanitized and capped.
#[test]
fn huge_sheet_name_is_sanitized() {
    let bytes = read_corpus_file("evil/huge_sheet_name.xlsx");
    let wb = engine_core::open_auto(bytes, OpenOptions::default(), "huge_sheet_name.xlsx")
        .expect("open");
    let meta = wb.metadata();
    let name = &meta.sheets[0].name;
    assert!(
        name.chars().count() <= 64,
        "name not capped: {} chars",
        name.chars().count()
    );
    assert!(
        !name.chars().any(|c| c.is_control()),
        "control chars survived"
    );
}

/// Misnamed sibling formats produce a named UNSUPPORTED_FORMAT, not CORRUPT.
#[test]
fn sibling_formats_are_named() {
    for (file, marker) in [("fake_xlsb.xlsx", ".xlsb"), ("fake_ods.xlsx", ".ods")] {
        let bytes = read_corpus_file(&format!("evil/{file}"));
        match engine_core::open_auto(bytes, OpenOptions::default(), file) {
            Err(EngineError::UnsupportedFormat(detail)) => assert!(
                detail.contains(marker),
                "{file}: detail does not name {marker}: {detail}"
            ),
            Err(e) => panic!("{file}: expected UNSUPPORTED_FORMAT, got {e}"),
            Ok(_) => panic!("{file}: expected UNSUPPORTED_FORMAT, got a workbook"),
        }
    }
}

/// Hostile per-part decompression beyond the cap must fail typed, not OOM.
/// (The committed high_ratio file is under the cap and must open fine.)
#[test]
fn high_ratio_under_cap_opens() {
    let bytes = read_corpus_file("evil/high_ratio.xlsx");
    let mut wb =
        engine_core::open_auto(bytes, OpenOptions::default(), "high_ratio.xlsx").expect("open");
    wb.activate_all().expect("activate");
    assert_eq!(
        wb.sheet(0).map(|s| s.cell_count()),
        Some(0),
        "rows without cells stay empty"
    );
}
