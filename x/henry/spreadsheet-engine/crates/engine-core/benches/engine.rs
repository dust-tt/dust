//! Criterion benchmark floor: parse, viewport, batch, search and numfmt
//! costs over the committed corpus. Numbers are non-gating (no committed
//! baseline yet); `check-all.sh` runs each bench body once (`-- --test`) so
//! compile breaks and corpus panics surface. Record numbers locally with
//! `cargo bench -p engine-core --bench engine`.

use criterion::{criterion_group, criterion_main, Criterion};

use engine_core::numfmt::{format_number, format_number_parsed, ParsedFormat, EN_US};
use engine_core::value::CellValue;
use engine_core::viewport::{get_rows_batch, get_viewport, DisplayMode};
use engine_core::workbook::{SheetBuilder, SheetVisibility, Workbook};
use engine_core::{search, OpenOptions};

fn corpus_file(rel: &str) -> Vec<u8> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../corpus")
        .join(rel);
    std::fs::read(&path).unwrap_or_else(|e| panic!("read corpus file {}: {e}", path.display()))
}

fn opened(rel: &str, name: &str) -> Workbook {
    let mut wb = engine_core::open_auto(corpus_file(rel), OpenOptions::default(), name)
        .expect("open corpus file");
    wb.activate_all().expect("activate");
    wb
}

/// 100k-cell synthetic sheet: mixed strings and numbers, search-friendly.
fn search_workbook() -> Workbook {
    let mut b = SheetBuilder::new("big".to_string(), SheetVisibility::Visible, u32::MAX);
    for row in 0..10_000u32 {
        for col in 0..10u32 {
            if (row + col) % 3 == 0 {
                let sref = b.intern(&format!("label {row} {col}"));
                b.push_cell(row, col, CellValue::InlineString(sref), 0, None);
            } else {
                b.push_cell(
                    row,
                    col,
                    CellValue::Number((row * 10 + col) as f64 / 7.0),
                    0,
                    None,
                );
            }
        }
    }
    Workbook::from_sheets(
        vec![b.finish()],
        Default::default(),
        Default::default(),
        false,
    )
}

fn benches(c: &mut Criterion) {
    let xlsx_bytes = corpus_file("gen/mixed_large.xlsx");
    c.bench_function("open_xlsx_mixed_large", |b| {
        b.iter(|| {
            let mut wb = engine_core::open_auto(
                xlsx_bytes.clone(),
                OpenOptions::default(),
                "mixed_large.xlsx",
            )
            .expect("open");
            wb.activate_all().expect("activate");
            wb
        })
    });

    let csv_bytes = corpus_file("gen/csv/generated_medium.csv");
    c.bench_function("open_csv_generated_medium", |b| {
        b.iter(|| {
            engine_core::open_auto(csv_bytes.clone(), OpenOptions::default(), "gen.csv")
                .expect("open")
        })
    });

    let styled = opened("gen/mixed_large.xlsx", "mixed_large.xlsx");
    c.bench_function("viewport_60x40_styled", |b| {
        b.iter(|| get_viewport(&styled, 0, (0, 59), (0, 39), DisplayMode::Value))
    });
    c.bench_function("rows_batch_100", |b| {
        b.iter(|| get_rows_batch(&styled, 0, 0, 100))
    });

    let big = search_workbook();
    let opts = search::SearchOpts::default();
    c.bench_function("search_100k_cells", |b| {
        b.iter(|| search::search(&big, "label 9999", &opts))
    });

    let fmt = "#,##0.00;[Red](#,##0.00)";
    let parsed = ParsedFormat::parse(fmt);
    c.bench_function("format_1k_custom_reparsed", |b| {
        b.iter(|| {
            for i in 0..1_000 {
                format_number(i as f64 * 1.37 - 250.0, fmt, false, &EN_US);
            }
        })
    });
    c.bench_function("format_1k_custom_cached", |b| {
        b.iter(|| {
            for i in 0..1_000 {
                format_number_parsed(i as f64 * 1.37 - 250.0, &parsed, false, &EN_US);
            }
        })
    });
}

criterion_group!(benches_group, benches);
criterion_main!(benches_group);
