//! Adversarial corpus. Each file carries a committed
//! expectation: a typed error code, or `"partial"` (open succeeds, possibly
//! truncated/partial preview). The engine must never panic, hang, or blow the
//! memory budget on any of these.

use crate::corpus::build_all;
use crate::{
    write_xlsx, zip_binary_parts, zip_parts, GenHyperlink, GenSheet, GenValue, GenWorkbook,
};

pub struct EvilFile {
    pub name: String,
    pub bytes: Vec<u8>,
    /// `"CORRUPT" | "UNSUPPORTED_FORMAT" | "ENCRYPTED" | "partial" | "ok"`.
    /// `partial`/`ok`: open must succeed (typed error also acceptable for
    /// `partial` only when the central directory itself is gone — see tests).
    pub expectation: &'static str,
}

pub fn build_evil() -> Vec<EvilFile> {
    let mut out: Vec<EvilFile> = Vec::new();

    // 1. Truncated files: every synthetic corpus file cut at 50% and 90%.
    // Truncation usually destroys the zip central directory -> CORRUPT, but
    // must never panic or hang.
    for f in build_all() {
        for pct in [50usize, 90] {
            let cut = f.xlsx.len() * pct / 100;
            out.push(EvilFile {
                name: format!("truncated_{pct}_{}", f.name),
                bytes: f.xlsx[..cut].to_vec(),
                expectation: "CORRUPT",
            });
        }
    }

    // 2. Garbage bytes.
    out.push(EvilFile {
        name: "garbage.xlsx".to_string(),
        bytes: vec![0xAB; 4096],
        expectation: "CORRUPT",
    });
    out.push(EvilFile {
        name: "empty_file.xlsx".to_string(),
        bytes: Vec::new(),
        expectation: "CORRUPT",
    });

    // 3. Valid zip, but not a workbook.
    out.push(EvilFile {
        name: "zip_not_xlsx.xlsx".to_string(),
        bytes: zip_parts(&[("readme.txt".to_string(), "not a workbook".to_string())]),
        expectation: "CORRUPT",
    });

    // 4. Workbook whose sheet part is missing.
    {
        let wb = simple_workbook();
        let mut bytes = write_xlsx(&wb);
        bytes = remove_zip_entry(&bytes, "xl/worksheets/sheet1.xml");
        out.push(EvilFile {
            name: "missing_sheet_part.xlsx".to_string(),
            bytes,
            expectation: "partial",
        });
    }

    // 5. Lying <dimension>: claims A1:ZZ99999, actually 2 cells.
    {
        let mut wb = GenWorkbook::new();
        let mut sheet = GenSheet::new("liar");
        sheet.dimension_override = Some("A1:ZZ99999".to_string());
        sheet.cell(0, 0, GenValue::Number(1.0));
        sheet.cell(1, 1, GenValue::Number(2.0));
        wb.sheets.push(sheet);
        out.push(EvilFile {
            name: "lying_dimension.xlsx".to_string(),
            bytes: write_xlsx(&wb),
            expectation: "ok",
        });
    }

    // 6. Shared-string indices out of range.
    {
        let parts = workbook_parts_with_sheet(
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>9999</v></c><c r="B1" t="s"><v>-1</v></c><c r="C1" t="s"><v>junk</v></c></row></sheetData></worksheet>"#,
        );
        out.push(EvilFile {
            name: "bad_sst_index.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "ok",
        });
    }

    // 7. Malformed XML in the sheet part.
    {
        let parts =
            workbook_parts_with_sheet("<worksheet><sheetData><row r=\"1\"><c r=\"A1\"><v>1</v>");
        out.push(EvilFile {
            name: "unclosed_xml.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "partial",
        });
    }
    {
        let parts = workbook_parts_with_sheet("<worksheet><sheetData>&&&%%% not xml at all");
        out.push(EvilFile {
            name: "invalid_xml.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "partial",
        });
    }

    // 8. Deeply nested XML (parser must not recurse unboundedly).
    {
        let mut deep = String::from("<worksheet><sheetData>");
        for _ in 0..50_000 {
            deep.push_str("<x>");
        }
        let parts = workbook_parts_with_sheet(&deep);
        out.push(EvilFile {
            name: "deep_nesting.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "partial",
        });
    }

    // 9. 100k merges.
    {
        let mut wb = GenWorkbook::new();
        let mut sheet = GenSheet::new("merges");
        sheet.cell(0, 0, GenValue::Number(1.0));
        for i in 0..100_000u32 {
            let row = (i / 50) * 2;
            let col = (i % 50) * 2;
            sheet.merges.push(format!(
                "{}:{}",
                crate::a1(row, col),
                crate::a1(row + 1, col + 1)
            ));
        }
        wb.sheets.push(sheet);
        out.push(EvilFile {
            name: "merges_100k.xlsx".to_string(),
            bytes: write_xlsx(&wb),
            expectation: "ok",
        });
    }

    // 10. 1M-char single cell.
    {
        let mut wb = GenWorkbook::new();
        let mut sheet = GenSheet::new("bigcell");
        sheet.cell(0, 0, GenValue::InlineStr("x".repeat(1_000_000)));
        wb.sheets.push(sheet);
        out.push(EvilFile {
            name: "million_char_cell.xlsx".to_string(),
            bytes: write_xlsx(&wb),
            expectation: "ok",
        });
    }

    // 10b. Hostile number formats in styles.xml: fraction formats with huge
    // placeholder runs (denominator-scan DoS) and absurd fixed denominators.
    // Formatting must stay bounded; never hang or panic.
    {
        let mut wb = GenWorkbook::new();
        let frac_dos = wb.add_style(crate::GenStyle {
            num_fmt: Some(format!("?/{}", "?".repeat(40))),
            ..crate::GenStyle::default()
        });
        let frac_fixed = wb.add_style(crate::GenStyle {
            num_fmt: Some("# ?/99999999999999999999".to_string()),
            ..crate::GenStyle::default()
        });
        let deep_sections = wb.add_style(crate::GenStyle {
            num_fmt: Some("0;".repeat(200)),
            ..crate::GenStyle::default()
        });
        let mut sheet = GenSheet::new("evilfmt");
        sheet.styled(0, 0, GenValue::Number(0.333333333), frac_dos);
        sheet.styled(0, 1, GenValue::Number(0.5), frac_fixed);
        sheet.styled(0, 2, GenValue::Number(-1.0), deep_sections);
        sheet.styled(0, 3, GenValue::Number(1e300), frac_dos);
        wb.sheets.push(sheet);
        out.push(EvilFile {
            name: "hostile_numfmt.xlsx".to_string(),
            bytes: write_xlsx(&wb),
            expectation: "ok",
        });
    }

    // 10c. Overflow-length A1 refs in cells, merges and hyperlinks: a long
    // letter run must be rejected, not overflow into a wrapped column index.
    {
        let long_ref = format!("{}1", "A".repeat(30));
        let parts = workbook_parts_with_sheet(&format!(
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="{long_ref}"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:{long_ref}"/></mergeCells></worksheet>"#
        ));
        out.push(EvilFile {
            name: "overflow_refs.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "ok",
        });
    }

    // 11. Zip-bomb-ish: a sheet XML with a hugely repetitive ~22 MB body that
    // compresses ~1000x. The per-part size cap must defuse anything larger.
    {
        let mut body = String::from("<worksheet><sheetData>");
        body.push_str(&"<row></row>".repeat(2_000_000));
        body.push_str("</sheetData></worksheet>");
        let parts = workbook_parts_with_sheet(&body);
        out.push(EvilFile {
            name: "high_ratio.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "ok",
        });
    }

    // 12. CFB containers: legacy .xls (renamed) and encrypted OOXML.
    out.push(EvilFile {
        name: "fake_xls.xlsx".to_string(),
        bytes: fake_cfb(false),
        expectation: "UNSUPPORTED_FORMAT",
    });
    out.push(EvilFile {
        name: "encrypted.xlsx".to_string(),
        bytes: fake_cfb(true),
        expectation: "ENCRYPTED",
    });

    // 14. Hyperlink XSS: executable/local URL schemes in every disguise the
    // engine must drop (the cells themselves stay). Two safe links act as the
    // positive control.
    {
        let mut wb = GenWorkbook::new();
        let mut sheet = GenSheet::new("xss");
        let bad_targets = [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(document.domain)",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:msgbox(1)",
            "file:///etc/passwd",
            " \tjavascript:alert(1)",
            "java\nscript:alert(1)",
        ];
        for (row, target) in bad_targets.iter().enumerate() {
            sheet.cell(row as u32, 0, GenValue::SharedStr(format!("bad{row}")));
            sheet.hyperlinks.push(GenHyperlink {
                ref_range: crate::a1(row as u32, 0),
                target: Some(target.to_string()),
                location: None,
                tooltip: None,
            });
        }
        let safe_row = bad_targets.len() as u32;
        sheet.cell(safe_row, 0, GenValue::SharedStr("good".to_string()));
        sheet.hyperlinks.push(GenHyperlink {
            ref_range: crate::a1(safe_row, 0),
            target: Some("https://example.com/safe".to_string()),
            location: None,
            tooltip: None,
        });
        sheet.cell(safe_row + 1, 0, GenValue::SharedStr("anchor".to_string()));
        sheet.hyperlinks.push(GenHyperlink {
            ref_range: crate::a1(safe_row + 1, 0),
            target: None,
            location: Some("xss!A1".to_string()),
            tooltip: None,
        });
        wb.sheets.push(sheet);
        out.push(EvilFile {
            name: "xss_hyperlinks.xlsx".to_string(),
            bytes: write_xlsx(&wb),
            expectation: "ok",
        });
    }

    // 15. Hostile rel targets that `..`-escape the part namespace. The
    // worksheet rel must be treated as missing, never resolved outside the
    // logical part tree.
    {
        let parts = vec![
            ("_rels/.rels".to_string(), ROOT_RELS.to_string()),
            (
                "xl/workbook.xml".to_string(),
                r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="escape" sheetId="1" r:id="rId1"/></sheets></workbook>"#.to_string(),
            ),
            (
                "xl/_rels/workbook.xml.rels".to_string(),
                r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="../../../../worksheets/sheet1.xml"/></Relationships>"#.to_string(),
            ),
            (
                "xl/worksheets/sheet1.xml".to_string(),
                r#"<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>"#.to_string(),
            ),
        ];
        out.push(EvilFile {
            name: "rel_target_escape.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "partial",
        });
    }

    // 16. A 1 MB sheet name with embedded control characters: tab rendering
    // must see a short sanitized name, not unbounded DoS bytes.
    {
        let mut wb = GenWorkbook::new();
        let mut name = "x".repeat(1_000_000);
        name.push('\u{1}');
        name.push_str("\nevil");
        let mut sheet = GenSheet::new(&name);
        sheet.cell(0, 0, GenValue::Number(1.0));
        wb.sheets.push(sheet);
        out.push(EvilFile {
            name: "huge_sheet_name.xlsx".to_string(),
            bytes: write_xlsx(&wb),
            expectation: "ok",
        });
    }

    // 17. Aggregate zip bomb: each part passes the per-part cap, but the sum
    // (4 x 24 MB from a few-hundred-KB input) exceeds the total-decompression
    // budget. Open succeeds (sheets are lazy); activation must fail typed,
    // never OOM.
    {
        let mut part = String::from("<worksheet><sheetData>");
        part.push_str(&"<row></row>".repeat(2_181_818)); // ~24 MB
        part.push_str("</sheetData></worksheet>");
        let mut parts = vec![
            ("_rels/.rels".to_string(), ROOT_RELS.to_string()),
            (
                "xl/workbook.xml".to_string(),
                r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="b1" sheetId="1" r:id="rId1"/><sheet name="b2" sheetId="2" r:id="rId2"/><sheet name="b3" sheetId="3" r:id="rId3"/><sheet name="b4" sheetId="4" r:id="rId4"/></sheets></workbook>"#.to_string(),
            ),
            (
                "xl/_rels/workbook.xml.rels".to_string(),
                r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/></Relationships>"#.to_string(),
            ),
        ];
        for i in 1..=4 {
            parts.push((format!("xl/worksheets/sheet{i}.xml"), part.clone()));
        }
        out.push(EvilFile {
            name: "zip_bomb_total.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "ok",
        });
    }

    // 18. Misnamed sibling formats: name the real format in the error instead
    // of a generic CORRUPT.
    out.push(EvilFile {
        name: "fake_xlsb.xlsx".to_string(),
        bytes: zip_parts(&[
            (
                "_rels/.rels".to_string(),
                r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.bin"/></Relationships>"#.to_string(),
            ),
            ("xl/workbook.bin".to_string(), "BIFF12".to_string()),
        ]),
        expectation: "UNSUPPORTED_FORMAT",
    });
    out.push(EvilFile {
        name: "fake_ods.xlsx".to_string(),
        bytes: zip_parts(&[
            (
                "mimetype".to_string(),
                "application/vnd.oasis.opendocument.spreadsheet".to_string(),
            ),
            ("content.xml".to_string(), "<office:document/>".to_string()),
        ]),
        expectation: "UNSUPPORTED_FORMAT",
    });

    // 13. Workbook with zero sheets.
    {
        let parts = vec![
            ("_rels/.rels".to_string(), ROOT_RELS.to_string()),
            (
                "xl/workbook.xml".to_string(),
                r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>"#.to_string(),
            ),
        ];
        out.push(EvilFile {
            name: "zero_sheets.xlsx".to_string(),
            bytes: zip_parts(&parts),
            expectation: "CORRUPT",
        });
    }

    out
}

const ROOT_RELS: &str = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;

fn simple_workbook() -> GenWorkbook {
    let mut wb = GenWorkbook::new();
    let mut sheet = GenSheet::new("one");
    sheet.cell(0, 0, GenValue::Number(1.0));
    wb.sheets.push(sheet);
    wb
}

/// Minimal workbook scaffold around a raw worksheet XML payload.
fn workbook_parts_with_sheet(sheet_xml: &str) -> Vec<(String, String)> {
    vec![
        ("_rels/.rels".to_string(), ROOT_RELS.to_string()),
        (
            "xl/workbook.xml".to_string(),
            r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="evil" sheetId="1" r:id="rId1"/></sheets></workbook>"#.to_string(),
        ),
        (
            "xl/_rels/workbook.xml.rels".to_string(),
            r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#.to_string(),
        ),
        ("xl/worksheets/sheet1.xml".to_string(), sheet_xml.to_string()),
    ]
}

/// Re-zip without one entry (zip-level surgery via full rewrite).
fn remove_zip_entry(bytes: &[u8], remove: &str) -> Vec<u8> {
    use std::io::Read;
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes.to_vec())).expect("valid zip");
    let mut parts: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).expect("zip entry");
        if file.name() == remove {
            continue;
        }
        let mut content = Vec::new();
        file.read_to_end(&mut content).expect("read entry");
        parts.push((file.name().to_string(), content));
    }
    zip_binary_parts(&parts)
}

/// A minimal CFB (Compound File Binary) header. Real CFB parsing is out of
/// scope — the engine only needs the magic plus, for the encrypted variant,
/// the `EncryptedPackage` stream-name marker somewhere in the bytes.
fn fake_cfb(encrypted: bool) -> Vec<u8> {
    let mut bytes = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    bytes.resize(512, 0);
    if encrypted {
        let marker: Vec<u8> = "EncryptedPackage"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        bytes.extend_from_slice(&marker);
        bytes.resize(1024, 0);
    }
    bytes
}
