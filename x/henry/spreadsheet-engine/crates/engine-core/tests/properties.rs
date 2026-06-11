//! Property tests (spec §7.3): viewport consistency, truncation
//! monotonicity, search soundness, and fuzz-lite byte mutation. Proptest with
//! a fixed RNG config — failures persist regression files under
//! `proptest-regressions/` (committed).

mod common;

use proptest::prelude::*;

use engine_core::viewport::{get_viewport, DisplayMode};
use engine_core::{OpenOptions, Workbook};

/// Deterministically build a workbook from a compact cell spec.
fn build_workbook(cells: &[(u32, u32, f64)]) -> Workbook {
    use engine_core::value::CellValue;
    use engine_core::workbook::{SheetBuilder, SheetVisibility};
    let mut b = SheetBuilder::new("p".to_string(), SheetVisibility::Visible, u32::MAX);
    for &(r, c, v) in cells {
        b.push_cell(r % 500, c % 80, CellValue::Number(v), 0, None);
    }
    Workbook::from_sheets(
        vec![b.finish()],
        Default::default(),
        Default::default(),
        false,
    )
}

fn key_set(
    slice: &engine_core::viewport::ViewportSlice,
) -> std::collections::BTreeSet<(u32, u32, String)> {
    slice
        .cells
        .iter()
        .map(|c| (c.row, c.col, c.text.clone()))
        .collect()
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 64, ..ProptestConfig::default() })]

    /// Cells never escape the requested rectangle.
    #[test]
    fn viewport_stays_in_rect(
        cells in prop::collection::vec((0u32..500, 0u32..80, -1e6f64..1e6), 0..300),
        r0 in 0u32..500, r1 in 0u32..500, c0 in 0u32..80, c1 in 0u32..80,
    ) {
        let wb = build_workbook(&cells);
        let slice = get_viewport(&wb, 0, (r0, r1), (c0, c1), DisplayMode::Value);
        let (rlo, rhi) = (r0.min(r1), r0.max(r1));
        let (clo, chi) = (c0.min(c1), c0.max(c1));
        for cell in &slice.cells {
            prop_assert!(cell.row >= rlo && cell.row <= rhi);
            prop_assert!(cell.col >= clo && cell.col <= chi);
        }
    }

    /// get_viewport(R1) ∪ get_viewport(R2) == get_viewport(R1 ∪ R2) restricted
    /// to the union (spec's viewport-consistency property), checked on
    /// split rectangles whose union is exact.
    #[test]
    fn viewport_union_consistency(
        cells in prop::collection::vec((0u32..500, 0u32..80, -1e6f64..1e6), 0..300),
        r0 in 0u32..400, height in 2u32..100, split in 1u32..99,
        c0 in 0u32..70, width in 1u32..10,
    ) {
        let wb = build_workbook(&cells);
        let r1 = r0 + height;
        let rsplit = r0 + (split % height).max(1) - 1; // split row inside [r0, r1)
        let c1 = c0 + width;

        let whole = get_viewport(&wb, 0, (r0, r1), (c0, c1), DisplayMode::Value);
        let top = get_viewport(&wb, 0, (r0, rsplit), (c0, c1), DisplayMode::Value);
        let bottom = get_viewport(&wb, 0, (rsplit + 1, r1), (c0, c1), DisplayMode::Value);

        let mut union = key_set(&top);
        union.extend(key_set(&bottom));
        prop_assert_eq!(union, key_set(&whole));
    }

    /// Empty regions are empty.
    #[test]
    fn viewport_of_empty_region_is_empty(
        r0 in 600u32..1000, c0 in 100u32..200,
    ) {
        let wb = build_workbook(&[(0, 0, 1.0)]);
        let slice = get_viewport(&wb, 0, (r0, r0 + 50), (c0, c0 + 20), DisplayMode::Value);
        prop_assert!(slice.cells.is_empty());
    }

    /// Search results point at cells whose display text contains the query
    /// (case-folded) — soundness, on generated numeric workbooks.
    #[test]
    fn search_soundness(
        cells in prop::collection::vec((0u32..500, 0u32..80, 0f64..1e6), 1..200),
        needle in "[0-9]{1,3}",
    ) {
        let wb = build_workbook(&cells);
        let results = engine_core::search::search(&wb, &needle, &engine_core::search::SearchOpts::default());
        for hit in &results.hits {
            let slice = get_viewport(&wb, hit.sheet, (hit.row, hit.row), (hit.col, hit.col), DisplayMode::Value);
            prop_assert_eq!(slice.cells.len(), 1usize);
            let text = slice.cells[0].text.to_lowercase();
            prop_assert!(
                text.contains(&needle.to_lowercase()),
                "hit {} text {:?} does not contain {:?}", hit.a1, text, needle
            );
        }
    }
}

/// Truncation monotonicity (spec §7.3): budgets B1 < B2 ⇒ cells(B1) is a
/// row-major prefix of cells(B2). Checked on a real corpus file end to end.
#[test]
fn truncation_monotonicity() {
    let bytes = common::read_corpus_file("gen/mixed_large.xlsx");
    let budgets = [10u32, 100, 1_000, 5_000, 30_000];
    let mut previous: Option<Vec<(u32, u32)>> = None;
    for &budget in &budgets {
        let opts = OpenOptions {
            max_cells_per_sheet: budget,
            ..OpenOptions::default()
        };
        let mut wb = engine_core::open_auto(bytes.clone(), opts, "mixed_large.xlsx").expect("open");
        wb.activate_all().expect("activate");
        let sheet = wb.sheet(0).expect("sheet");
        let cells: Vec<(u32, u32)> = sheet.cells().map(|(r, c, _, _)| (r, c)).collect();
        // Sorted row-major by construction.
        let mut sorted = cells.clone();
        sorted.sort();
        assert_eq!(cells, sorted, "budget {budget}: not row-major");
        if let Some(prev) = &previous {
            assert!(cells.len() >= prev.len(), "budget {budget}: shrank");
            assert_eq!(
                &cells[..prev.len()],
                prev.as_slice(),
                "budget {budget}: not a prefix of the larger budget"
            );
        }
        previous = Some(cells);
    }
}

/// Fuzz-lite (spec §7.3 last bullet): random byte mutations of valid files
/// never panic. Deterministic mutations via the corpus LCG; full fuzzing is a
/// separate nightly concern.
#[test]
fn mutated_bytes_never_panic() {
    use std::panic::{catch_unwind, AssertUnwindSafe};
    let base = common::read_corpus_file("gen/single_cell.xlsx");
    let mut rng = corpus_gen::Lcg::new(0xF422_0001);
    for round in 0..200 {
        let mut bytes = base.clone();
        let mutations = 1 + rng.below(8) as usize;
        for _ in 0..mutations {
            let pos = rng.below(bytes.len() as u32) as usize;
            bytes[pos] = (rng.below(256)) as u8;
        }
        let result = catch_unwind(AssertUnwindSafe(|| {
            if let Ok(mut wb) =
                engine_core::open_auto(bytes.clone(), OpenOptions::default(), "mutated.xlsx")
            {
                for i in 0..wb.sheet_count() {
                    let _ = wb.activate(i);
                }
                let _ = engine_core::canonical::canonical_json(&wb);
            }
        }));
        assert!(result.is_ok(), "mutation round {round} panicked");
    }
}
