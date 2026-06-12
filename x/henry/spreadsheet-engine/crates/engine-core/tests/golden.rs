//! Golden tests: every corpus file's canonical JSON is
//! byte-compared against a committed golden. Goldens are blessed explicitly
//! (`BLESS=1 cargo test`), never auto-blessed in CI.
//!
//! Also asserts the committed corpus matches its generator (regeneration is
//! byte-identical) and that engine values agree with the generator's own
//! expected-values model — the in-repo half of the differential matrix.

mod common;

use common::{assert_or_bless, open_full, read_corpus_file};
use engine_core::canonical::canonical_json;

fn gen_xlsx_names() -> Vec<&'static str> {
    corpus_gen::corpus::build_all()
        .iter()
        .map(|f| f.name)
        .collect()
}

#[test]
fn committed_corpus_matches_generator() {
    for f in corpus_gen::corpus::build_all() {
        let committed = read_corpus_file(&format!("gen/{}", f.name));
        assert_eq!(
            committed, f.xlsx,
            "{} drifted from its generator — rerun corpus-gen",
            f.name
        );
        let committed_expected = read_corpus_file(&format!(
            "gen/{}.expected.json",
            f.name.trim_end_matches(".xlsx")
        ));
        assert_eq!(
            committed_expected,
            f.expected_values.as_bytes(),
            "{} expected-values drifted",
            f.name
        );
    }
    for f in corpus_gen::corpus::build_csv_corpus() {
        let committed = read_corpus_file(&format!("gen/csv/{}", f.name));
        assert_eq!(
            committed, f.bytes,
            "csv {} drifted from its generator",
            f.name
        );
    }
    for f in corpus_gen::evil::build_evil() {
        let committed = read_corpus_file(&format!("evil/{}", f.name));
        assert_eq!(
            committed, f.bytes,
            "evil {} drifted from its generator",
            f.name
        );
    }
}

#[test]
fn xlsx_goldens() {
    for name in gen_xlsx_names() {
        let wb = open_full(&format!("gen/{name}"));
        let json = canonical_json(&wb);
        assert_or_bless(
            &format!("gen/golden/{}.json", name.trim_end_matches(".xlsx")),
            &json,
        );
    }
}

#[test]
fn csv_goldens() {
    for f in corpus_gen::corpus::build_csv_corpus() {
        let wb = open_full(&format!("gen/csv/{}", f.name));
        let json = canonical_json(&wb);
        assert_or_bless(&format!("gen/golden/csv/{}.json", f.name), &json);
    }
}

/// Engine values must equal the generator's independent model: same cells (by
/// A1), same type tags, same values. This catches parser bugs that goldens
/// alone would happily pin.
#[test]
fn values_match_generator_model() {
    for name in gen_xlsx_names() {
        let wb = open_full(&format!("gen/{name}"));
        let engine: serde_json::Value =
            serde_json::from_str(&canonical_json(&wb)).expect("engine json");
        let expected: serde_json::Value =
            serde_json::from_str(&String::from_utf8_lossy(&read_corpus_file(&format!(
                "gen/{}.expected.json",
                name.trim_end_matches(".xlsx")
            ))))
            .expect("expected json");

        assert_eq!(
            engine["date1904"], expected["date1904"],
            "{name}: date1904 flag"
        );
        let engine_sheets = engine["sheets"].as_array().expect("sheets");
        let expected_sheets = expected["sheets"].as_array().expect("sheets");
        assert_eq!(
            engine_sheets.len(),
            expected_sheets.len(),
            "{name}: sheet count"
        );

        for (es, xs) in engine_sheets.iter().zip(expected_sheets) {
            assert_eq!(es["name"], xs["name"], "{name}: sheet name");
            let engine_cells = es["cells"].as_array().expect("cells");
            let expected_cells = xs["cells"].as_array().expect("cells");
            assert_eq!(
                engine_cells.len(),
                expected_cells.len(),
                "{name}/{}: cell count",
                es["name"]
            );
            for (ec, xc) in engine_cells.iter().zip(expected_cells) {
                assert_eq!(ec["a1"], xc["a1"], "{name}: cell address");
                assert_eq!(ec["t"], xc["t"], "{name} {}: type", ec["a1"]);
                assert_eq!(ec["v"], xc["v"], "{name} {}: value", ec["a1"]);
            }
        }
    }
}

/// In-process determinism: parsing the same bytes twice yields byte-identical
/// canonical JSON (the cross-process/cross-target gate lives in scripts/).
#[test]
fn canonical_json_is_deterministic() {
    for name in gen_xlsx_names() {
        let a = canonical_json(&open_full(&format!("gen/{name}")));
        let b = canonical_json(&open_full(&format!("gen/{name}")));
        assert_eq!(a, b, "{name}: nondeterministic output");
    }
}
