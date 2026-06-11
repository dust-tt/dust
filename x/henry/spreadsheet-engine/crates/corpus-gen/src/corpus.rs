//! The synthetic corpus (spec §7.2 item 1): fixed, seeded, exhaustive over
//! the v1 feature list. Each entry returns (xlsx bytes, expected-values JSON).

use crate::{expected_values_json, write_xlsx, GenSheet, GenStyle, GenValue, GenWorkbook, Lcg};

pub struct CorpusFile {
    pub name: &'static str,
    pub xlsx: Vec<u8>,
    pub expected_values: String,
}

fn entry(name: &'static str, wb: GenWorkbook) -> CorpusFile {
    CorpusFile {
        name,
        xlsx: write_xlsx(&wb),
        expected_values: expected_values_json(&wb),
    }
}

pub fn build_all() -> Vec<CorpusFile> {
    vec![
        builtin_numfmts(),
        custom_numfmts(),
        strings_unicode(),
        merges_frozen_geometry(),
        dates_1900(),
        dates_1904(),
        formulas_and_errors(),
        empty_sheet(),
        single_cell(),
        extremes(),
        multi_sheet_50(),
        wide_short(),
        tall_narrow(),
        mixed_large(),
        duplicate_cells(),
    ]
}

/// Every built-in numFmt id 0..=49 applied to a spread of values.
fn builtin_numfmts() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let values = [
        0.0,
        1.0,
        -1.0,
        0.5,
        -0.5,
        1234.5678,
        -1234.5678,
        45000.0,
        45000.5209,
        0.123456,
        1e-5,
        123456789.0,
    ];
    let mut sheet = GenSheet::new("builtins");
    for (col, id) in (0u32..=49).enumerate() {
        let style = wb.add_style(GenStyle {
            builtin_numfmt: id,
            ..GenStyle::default()
        });
        sheet.styled(0, col as u32, GenValue::SharedStr(format!("id{id}")), 0);
        for (row, v) in values.iter().enumerate() {
            sheet.styled(row as u32 + 1, col as u32, GenValue::Number(*v), style);
        }
    }
    wb.sheets.push(sheet);
    entry("builtin_numfmts.xlsx", wb)
}

/// Custom format strings covering the §3.4 feature list.
fn custom_numfmts() -> CorpusFile {
    const FORMATS: &[&str] = &[
        "0",
        "0.00",
        "#,##0",
        "#,##0.00",
        "#,##0.000",
        "0%",
        "0.00%",
        "0.0%",
        "0.00E+00",
        "##0.0E+0",
        "# ?/?",
        "# ??/??",
        "?/?",
        "# ?/4",
        "0.0#",
        "0.??",
        "#.##",
        "0,",
        "0.0,,",
        "$#,##0.00",
        "$#,##0_);($#,##0)",
        "$#,##0.00_);[Red]($#,##0.00)",
        "0;-0;\"zero\";\"text: \"@",
        "[>=1000]#,##0;[<1000]0.00",
        "[Red]0.00",
        "[Blue]0;[Red]-0",
        "\"prefix \"0.00\" suffix\"",
        "0\\h",
        "yyyy-mm-dd",
        "m/d/yyyy",
        "m/d/yy",
        "d-mmm-yy",
        "d-mmm",
        "mmm-yy",
        "mmmm d, yyyy",
        "dddd",
        "ddd",
        "mmmmm",
        "h:mm",
        "h:mm AM/PM",
        "h:mm:ss AM/PM",
        "hh:mm:ss",
        "h:mm:ss.00",
        "[h]:mm",
        "[h]:mm:ss",
        "[mm]:ss",
        "[ss]",
        "m/d/yy h:mm",
        "mm:ss",
        "mmss.0",
        "yyyy\\-mm\\-dd",
        "@",
        "General",
        "General\" units\"",
    ];
    let values = [
        0.0,
        0.5,
        -0.5,
        1.0,
        -1.5,
        5.25,
        0.333333333,
        1234.5678,
        -1234.5678,
        0.123456,
        45000.0,
        45000.5209,
        60.0,
        59.0,
        61.0,
        1.5,
        12345678.9,
    ];
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("custom");
    for (col, fmt) in FORMATS.iter().enumerate() {
        let style = wb.add_style(GenStyle {
            num_fmt: Some(fmt.to_string()),
            ..GenStyle::default()
        });
        sheet.styled(0, col as u32, GenValue::SharedStr(format!("fmt:{fmt}")), 0);
        for (row, v) in values.iter().enumerate() {
            sheet.styled(row as u32 + 1, col as u32, GenValue::Number(*v), style);
        }
        // Text through the same format exercises the 4th/text section path.
        sheet.styled(
            values.len() as u32 + 1,
            col as u32,
            GenValue::InlineStr("textval".to_string()),
            style,
        );
    }
    wb.sheets.push(sheet);
    entry("custom_numfmts.xlsx", wb)
}

/// Shared vs inline strings, unicode (emoji, RTL, CJK, combining marks),
/// whitespace preservation, XML-escaped characters, a 10k-char cell.
fn strings_unicode() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("strings");
    let samples = [
        "plain ascii",
        "héllo wörld",
        "emoji 🎉🚀😀",
        "مرحبا بالعالم",  // RTL Arabic
        "שלום עולם",      // RTL Hebrew
        "你好世界",       // CJK
        "日本語テキスト", // Japanese
        "한국어 텍스트",  // Korean
        "combining: éé (e\u{0301}e\u{0301})",
        "  leading and trailing  ",
        "tab\tseparated",
        "line1\nline2",
        "<xml> & \"quotes\" 'apos'",
        "ZALGO z̸̢̛a̴͝l̶̓g̷̈́o̵͘",
        "",
    ];
    for (i, s) in samples.iter().enumerate() {
        if s.is_empty() {
            continue; // empty strings are skipped by the sparse model
        }
        sheet.cell(i as u32, 0, GenValue::SharedStr(s.to_string()));
        sheet.cell(i as u32, 1, GenValue::InlineStr(s.to_string()));
    }
    // Same shared string used many times: one arena entry.
    for row in 20..40 {
        sheet.cell(row, 0, GenValue::SharedStr("repeated".to_string()));
    }
    // 10k-char single cell.
    let long: String = "abcdefghij".repeat(1000);
    sheet.cell(40, 0, GenValue::SharedStr(long));
    wb.sheets.push(sheet);
    entry("strings_unicode.xlsx", wb)
}

/// Merges (incl. crossing frozen panes), hidden rows/cols, widths/heights.
fn merges_frozen_geometry() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let bold = wb.add_style(GenStyle {
        bold: true,
        ..GenStyle::default()
    });
    let filled = wb.add_style(GenStyle {
        fill_rgb: Some("FF00B050".to_string()),
        ..GenStyle::default()
    });
    let centered = wb.add_style(GenStyle {
        halign: Some("center".to_string()),
        wrap: true,
        ..GenStyle::default()
    });
    let mut sheet = GenSheet::new("geometry");
    for row in 0..20 {
        for col in 0..10 {
            sheet.styled(
                row,
                col,
                GenValue::Number((row * 10 + col) as f64),
                match (row + col) % 3 {
                    0 => bold,
                    1 => filled,
                    _ => centered,
                },
            );
        }
    }
    sheet.merges = vec![
        "A1:C1".to_string(), // merge in frozen rows
        "A3:A6".to_string(), // vertical merge crossing the frozen-row boundary? no: starts below
        "B2:D4".to_string(), // merge crossing the frozen boundary (frozen 2 rows / 1 col)
        "E5:G7".to_string(),
        "I10:J12".to_string(),
    ];
    sheet.frozen = (2, 1);
    sheet.col_widths = vec![(0, 25.0), (3, 4.5), (5, 30.0)];
    sheet.row_heights = vec![(0, 30.0), (5, 45.0)];
    sheet.hidden_rows = vec![8, 9];
    sheet.hidden_cols = vec![7];
    wb.sheets.push(sheet);
    entry("merges_frozen.xlsx", wb)
}

fn dates_1900() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let date = wb.add_style(GenStyle {
        num_fmt: Some("yyyy-mm-dd".to_string()),
        ..GenStyle::default()
    });
    let datetime = wb.add_style(GenStyle {
        num_fmt: Some("yyyy-mm-dd hh:mm:ss".to_string()),
        ..GenStyle::default()
    });
    let builtin14 = wb.add_style(GenStyle {
        builtin_numfmt: 14,
        ..GenStyle::default()
    });
    let mut sheet = GenSheet::new("dates1900");
    // The classic differential-test serials: 0, 1, 59, 60 (fake leap day), 61.
    let serials = [
        0.0,
        1.0,
        2.0,
        59.0,
        60.0,
        61.0,
        100.0,
        36526.0,
        45000.0,
        45000.5,
        45000.99999,
    ];
    for (i, s) in serials.iter().enumerate() {
        sheet.styled(i as u32, 0, GenValue::Number(*s), date);
        sheet.styled(i as u32, 1, GenValue::Number(*s), datetime);
        sheet.styled(i as u32, 2, GenValue::Number(*s), builtin14);
    }
    wb.sheets.push(sheet);
    entry("dates_1900.xlsx", wb)
}

fn dates_1904() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    wb.date1904 = true;
    let date = wb.add_style(GenStyle {
        num_fmt: Some("yyyy-mm-dd".to_string()),
        ..GenStyle::default()
    });
    let mut sheet = GenSheet::new("dates1904");
    for (i, s) in [0.0, 1.0, 365.0, 1462.0, 43538.0].iter().enumerate() {
        sheet.styled(i as u32, 0, GenValue::Number(*s), date);
    }
    wb.sheets.push(sheet);
    entry("dates_1904.xlsx", wb)
}

/// Formula cells with cached values of all types + plain error/bool cells.
fn formulas_and_errors() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("formulas");
    sheet.cell(
        0,
        0,
        GenValue::Formula {
            formula: "1+1".to_string(),
            cached: Box::new(GenValue::Number(2.0)),
        },
    );
    sheet.cell(
        0,
        1,
        GenValue::Formula {
            formula: "CONCATENATE(\"a\",\"b\")".to_string(),
            cached: Box::new(GenValue::InlineStr("ab".to_string())),
        },
    );
    sheet.cell(
        0,
        2,
        GenValue::Formula {
            formula: "1>0".to_string(),
            cached: Box::new(GenValue::Bool(true)),
        },
    );
    sheet.cell(
        0,
        3,
        GenValue::Formula {
            formula: "1/0".to_string(),
            cached: Box::new(GenValue::Error("#DIV/0!".to_string())),
        },
    );
    sheet.cell(
        0,
        4,
        GenValue::Formula {
            formula: "SUM(A1:A1048576)".to_string(),
            cached: Box::new(GenValue::Number(2.0)),
        },
    );
    for (i, e) in [
        "#DIV/0!", "#N/A", "#NAME?", "#NULL!", "#NUM!", "#REF!", "#VALUE!",
    ]
    .iter()
    .enumerate()
    {
        sheet.cell(2, i as u32, GenValue::Error(e.to_string()));
    }
    sheet.cell(3, 0, GenValue::Bool(true));
    sheet.cell(3, 1, GenValue::Bool(false));
    wb.sheets.push(sheet);
    entry("formulas_errors.xlsx", wb)
}

fn empty_sheet() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    wb.sheets.push(GenSheet::new("empty"));
    entry("empty_sheet.xlsx", wb)
}

fn single_cell() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("single");
    sheet.cell(0, 0, GenValue::SharedStr("only".to_string()));
    wb.sheets.push(sheet);
    entry("single_cell.xlsx", wb)
}

/// Cells at the XLSX extremes: last row, last column, far corners.
fn extremes() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("extremes");
    sheet.cell(0, 0, GenValue::SharedStr("origin".to_string()));
    sheet.cell(1_048_575, 0, GenValue::SharedStr("last row".to_string()));
    sheet.cell(0, 16_383, GenValue::SharedStr("last col".to_string()));
    sheet.cell(
        1_048_575,
        16_383,
        GenValue::SharedStr("far corner".to_string()),
    );
    wb.sheets.push(sheet);
    entry("extremes.xlsx", wb)
}

fn multi_sheet_50() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    for i in 0..50u32 {
        let mut sheet = GenSheet::new(&format!("Sheet{:02}", i + 1));
        sheet.state = match i % 10 {
            7 => "hidden",
            9 => "veryHidden",
            _ => "visible",
        };
        sheet.cell(0, 0, GenValue::Number(i as f64));
        sheet.cell(i, i, GenValue::SharedStr(format!("diag{i}")));
        wb.sheets.push(sheet);
    }
    entry("multi_sheet_50.xlsx", wb)
}

fn wide_short() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("wide");
    for col in 0..2000u32 {
        sheet.cell(0, col, GenValue::Number(col as f64));
        sheet.cell(1, col, GenValue::SharedStr(format!("c{col}")));
    }
    wb.sheets.push(sheet);
    entry("wide_short.xlsx", wb)
}

fn tall_narrow() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("tall");
    for row in 0..50_000u32 {
        sheet.cell(row, 0, GenValue::Number(row as f64));
    }
    wb.sheets.push(sheet);
    entry("tall_narrow.xlsx", wb)
}

/// ~30k mixed-type cells, sparse, LCG-seeded. Sized for fast PR-loop tests.
fn mixed_large() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let money = wb.add_style(GenStyle {
        num_fmt: Some("$#,##0.00".to_string()),
        ..GenStyle::default()
    });
    let pct = wb.add_style(GenStyle {
        builtin_numfmt: 10,
        ..GenStyle::default()
    });
    let date = wb.add_style(GenStyle {
        builtin_numfmt: 14,
        ..GenStyle::default()
    });
    let mut sheet = GenSheet::new("mixed");
    let mut rng = Lcg::new(0x5EED_CAFE_0001);
    for _ in 0..30_000 {
        let row = rng.below(5_000);
        let col = rng.below(60);
        let value = match rng.below(6) {
            0 => GenValue::Number(rng.below(1_000_000) as f64 / 100.0),
            1 => GenValue::Number(rng.below(100_000) as f64),
            2 => GenValue::SharedStr(format!("label-{}", rng.below(500))),
            3 => GenValue::Number(40_000.0 + rng.below(5_000) as f64),
            4 => GenValue::Bool(rng.below(2) == 1),
            _ => GenValue::Number(rng.below(10_000) as f64 / 10_000.0),
        };
        let style = match rng.below(4) {
            0 => money,
            1 => pct,
            2 => date,
            _ => 0,
        };
        sheet.styled(row, col, value, style);
    }
    wb.sheets.push(sheet);
    entry("mixed_large.xlsx", wb)
}

/// Duplicate cell refs in the XML: last write wins.
fn duplicate_cells() -> CorpusFile {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("dups");
    sheet.cell(0, 0, GenValue::SharedStr("first".to_string()));
    sheet.cell(0, 0, GenValue::SharedStr("second".to_string()));
    sheet.cell(1, 1, GenValue::Number(1.0));
    sheet.cell(1, 1, GenValue::Number(2.0));
    wb.sheets.push(sheet);
    entry("duplicate_cells.xlsx", wb)
}

// ---------------------------------------------------------------------------
// CSV corpus
// ---------------------------------------------------------------------------

pub struct CsvCorpusFile {
    pub name: &'static str,
    pub bytes: Vec<u8>,
}

pub fn build_csv_corpus() -> Vec<CsvCorpusFile> {
    let mut out = vec![
        CsvCorpusFile {
            name: "simple.csv",
            bytes: b"name,qty,price\nwidget,2,9.99\ngadget,10,1234.5\n".to_vec(),
        },
        CsvCorpusFile {
            name: "quoting.csv",
            bytes: b"\"a,1\",\"line1\nline2\",\"escaped \"\"q\"\"\"\nplain,2,3\n".to_vec(),
        },
        CsvCorpusFile {
            name: "semicolon.csv",
            bytes: b"a;b;c\n1;2;3\n4;5;6\n".to_vec(),
        },
        CsvCorpusFile {
            name: "tabs.tsv",
            bytes: b"a\tb\tc\n1\t2\t3\n".to_vec(),
        },
        CsvCorpusFile {
            name: "pipes.csv",
            bytes: b"a|b|c\n1|2|3\n".to_vec(),
        },
        CsvCorpusFile {
            name: "bom_crlf.csv",
            bytes: b"\xEF\xBB\xBFh1,h2\r\nv1,v2\r\n".to_vec(),
        },
        CsvCorpusFile {
            name: "cr_only.csv",
            bytes: b"a,b\r1,2\r".to_vec(),
        },
        CsvCorpusFile {
            name: "ragged.csv",
            bytes: b"a,b,c\nx\n1,2\n,,z\n".to_vec(),
        },
        CsvCorpusFile {
            name: "trailing_empty_cols.csv",
            bytes: b"a,b,,,\n1,2,,,\n".to_vec(),
        },
        CsvCorpusFile {
            name: "unicode.csv",
            bytes: "héllo,🎉,你好\nمرحبا,1,2\n".as_bytes().to_vec(),
        },
    ];
    // Bigger generated CSV: 200 rows x 20 cols, deterministic.
    let mut big = String::new();
    let mut rng = Lcg::new(0xC5C5_0001);
    for row in 0..200 {
        for col in 0..20 {
            if col > 0 {
                big.push(',');
            }
            match (row + col) % 3 {
                0 => big.push_str(&format!("{}", rng.below(100000))),
                1 => big.push_str(&format!("text{}", rng.below(50))),
                _ => big.push_str(&format!("{}.{:02}", rng.below(1000), rng.below(100))),
            }
        }
        big.push('\n');
    }
    out.push(CsvCorpusFile {
        name: "generated_medium.csv",
        bytes: big.into_bytes(),
    });
    out
}
