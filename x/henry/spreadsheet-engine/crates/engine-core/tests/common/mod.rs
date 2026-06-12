// Shared helpers compiled per integration-test binary; not every binary uses
// every helper.
#![allow(dead_code)]

use std::path::PathBuf;

/// Project-root-relative corpus directory.
pub fn corpus_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../corpus")
}

pub fn read_corpus_file(rel: &str) -> Vec<u8> {
    let path = corpus_dir().join(rel);
    std::fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "missing corpus file {} ({e}) — run `cargo run -p corpus-gen --release -- corpus`",
            path.display()
        )
    })
}

/// Open + fully activate a corpus xlsx.
pub fn open_full(rel: &str) -> engine_core::Workbook {
    let bytes = read_corpus_file(rel);
    let mut wb = engine_core::open_auto(bytes, engine_core::OpenOptions::default(), rel)
        .unwrap_or_else(|e| panic!("open {rel}: {e}"));
    wb.activate_all()
        .unwrap_or_else(|e| panic!("activate {rel}: {e}"));
    wb
}

/// `BLESS=1 cargo test` rewrites goldens instead of asserting.
pub fn blessing() -> bool {
    std::env::var("BLESS").is_ok_and(|v| v == "1")
}

pub fn assert_or_bless(golden_rel: &str, actual: &str) {
    let path = corpus_dir().join(golden_rel);
    if blessing() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create golden dir");
        }
        std::fs::write(&path, actual.as_bytes()).expect("write golden");
        return;
    }
    let expected = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "missing golden {} ({e}) — run BLESS=1 cargo test",
            path.display()
        )
    });
    assert_eq!(
        actual, expected,
        "golden mismatch for {golden_rel} — review and BLESS=1 if intended"
    );
}
