//! Write the synthetic + CSV + evil corpora to `corpus/` (run from the
//! project root: `cargo run -p corpus-gen --release`). Regeneration is
//! byte-identical; CI asserts the committed corpus matches.

use std::path::Path;

fn main() {
    let root = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "corpus".to_string());
    let root = Path::new(&root);

    let gen_dir = root.join("gen");
    let csv_dir = root.join("gen/csv");
    let evil_dir = root.join("evil");
    for d in [&gen_dir, &csv_dir, &evil_dir] {
        std::fs::create_dir_all(d).expect("create corpus dirs");
    }

    for f in corpus_gen::corpus::build_all() {
        std::fs::write(gen_dir.join(f.name), &f.xlsx).expect("write xlsx");
        let expected_name = format!("{}.expected.json", f.name.trim_end_matches(".xlsx"));
        std::fs::write(gen_dir.join(expected_name), f.expected_values.as_bytes())
            .expect("write expected");
    }
    for f in corpus_gen::corpus::build_csv_corpus() {
        std::fs::write(csv_dir.join(f.name), &f.bytes).expect("write csv");
    }
    let mut manifest = String::new();
    for f in corpus_gen::evil::build_evil() {
        std::fs::write(evil_dir.join(&f.name), &f.bytes).expect("write evil");
        manifest.push_str(&format!("{}\t{}\n", f.name, f.expectation));
    }
    std::fs::write(evil_dir.join("MANIFEST.tsv"), manifest).expect("write manifest");

    eprintln!("corpus written to {}", root.display());
}
