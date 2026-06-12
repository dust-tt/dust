//! Deterministic corpus generator.
//!
//! Writes `.xlsx` files through its own raw-XML templates + zip writer — a
//! code path entirely independent of `engine-core`'s parser, so generator and
//! parser cannot share bugs at the XML level. For each workbook it also emits
//! an expected-values JSON derived from the in-generator model (never from
//! parsing the produced file), which the differential tests compare against
//! engine output.
//!
//! Everything is seeded/fixed: regenerating the corpus is byte-identical.

use std::fmt::Write as _;

pub mod corpus;
pub mod evil;

/// Cell value in the generator's own model.
#[derive(Debug, Clone)]
pub enum GenValue {
    Number(f64),
    /// Stored via the shared-string table.
    SharedStr(String),
    /// Stored inline (`t="inlineStr"`).
    InlineStr(String),
    Bool(bool),
    /// Error literal, e.g. `#DIV/0!`.
    Error(String),
    /// Formula with a cached value.
    Formula {
        formula: String,
        cached: Box<GenValue>,
    },
}

#[derive(Debug, Clone)]
pub struct GenCell {
    pub row: u32,
    pub col: u32,
    pub value: GenValue,
    /// Index into the workbook style list (0 = default).
    pub style: u32,
}

#[derive(Debug, Clone, Default)]
pub struct GenStyle {
    /// Custom number format code; `None` means General unless `builtin_numfmt`.
    pub num_fmt: Option<String>,
    /// Built-in numFmtId (used when `num_fmt` is None).
    pub builtin_numfmt: u32,
    pub bold: bool,
    pub italic: bool,
    pub fill_rgb: Option<String>,
    pub font_rgb: Option<String>,
    pub halign: Option<String>,
    pub wrap: bool,
}

/// One `<hyperlink>` element: external targets go through the sheet's rels
/// part (`r:id`), internal ones use the `location` attribute.
#[derive(Debug, Clone)]
pub struct GenHyperlink {
    /// Anchor range, e.g. `"A1"` or `"A1:B2"`.
    pub ref_range: String,
    /// External URL; `None` means internal (use `location`).
    pub target: Option<String>,
    /// Internal location, e.g. `"Sheet2!A1"`.
    pub location: Option<String>,
    pub tooltip: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GenSheet {
    pub name: String,
    pub cells: Vec<GenCell>,
    /// A1 ranges, e.g. `"A1:B2"`.
    pub merges: Vec<String>,
    pub hyperlinks: Vec<GenHyperlink>,
    pub frozen: (u32, u32), // (rows, cols)
    pub col_widths: Vec<(u32, f64)>,
    pub row_heights: Vec<(u32, f64)>,
    pub hidden_rows: Vec<u32>,
    pub hidden_cols: Vec<u32>,
    pub state: &'static str, // "visible" | "hidden" | "veryHidden"
    /// If set, write a `<dimension>` element with this (possibly lying) ref.
    pub dimension_override: Option<String>,
}

impl GenSheet {
    pub fn new(name: &str) -> GenSheet {
        GenSheet {
            name: name.to_string(),
            cells: Vec::new(),
            merges: Vec::new(),
            hyperlinks: Vec::new(),
            frozen: (0, 0),
            col_widths: Vec::new(),
            row_heights: Vec::new(),
            hidden_rows: Vec::new(),
            hidden_cols: Vec::new(),
            state: "visible",
            dimension_override: None,
        }
    }

    pub fn cell(&mut self, row: u32, col: u32, value: GenValue) -> &mut Self {
        self.cells.push(GenCell {
            row,
            col,
            value,
            style: 0,
        });
        self
    }

    pub fn styled(&mut self, row: u32, col: u32, value: GenValue, style: u32) -> &mut Self {
        self.cells.push(GenCell {
            row,
            col,
            value,
            style,
        });
        self
    }
}

#[derive(Debug, Clone)]
pub struct GenWorkbook {
    pub sheets: Vec<GenSheet>,
    pub styles: Vec<GenStyle>,
    pub date1904: bool,
}

impl GenWorkbook {
    pub fn new() -> GenWorkbook {
        GenWorkbook {
            sheets: Vec::new(),
            styles: vec![GenStyle::default()],
            date1904: false,
        }
    }

    pub fn add_style(&mut self, style: GenStyle) -> u32 {
        self.styles.push(style);
        (self.styles.len() - 1) as u32
    }
}

impl Default for GenWorkbook {
    fn default() -> Self {
        GenWorkbook::new()
    }
}

/// Tiny deterministic LCG for "random" data (no external randomness, ever).
pub struct Lcg(u64);

impl Lcg {
    pub fn new(seed: u64) -> Lcg {
        Lcg(seed)
    }

    pub fn next_u32(&mut self) -> u32 {
        // Numerical Recipes LCG constants.
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }

    pub fn below(&mut self, n: u32) -> u32 {
        self.next_u32() % n.max(1)
    }
}

// ---------------------------------------------------------------------------
// XLSX writer (raw XML, independent of engine-core)
// ---------------------------------------------------------------------------

pub fn col_letters(col: u32) -> String {
    let mut n = col as i64 + 1;
    let mut out = Vec::new();
    while n > 0 {
        out.push(b'A' + ((n - 1) % 26) as u8);
        n = (n - 1) / 26;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

pub fn a1(row: u32, col: u32) -> String {
    format!("{}{}", col_letters(col), row + 1)
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

/// Format an f64 for XML output. Uses Rust's shortest round-trip formatting —
/// this is the *generator's* writer, distinct from the engine's ryu pipeline.
fn num_str(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

pub fn write_xlsx(wb: &GenWorkbook) -> Vec<u8> {
    // Collect shared strings in first-use order.
    let mut shared: Vec<String> = Vec::new();
    let shared_index = |s: &str, shared: &mut Vec<String>| -> usize {
        match shared.iter().position(|x| x == s) {
            Some(i) => i,
            None => {
                shared.push(s.to_string());
                shared.len() - 1
            }
        }
    };

    // Worksheets XML (+ per-sheet rels for external hyperlink targets).
    let mut sheet_xmls: Vec<String> = Vec::new();
    let mut sheet_rels: Vec<Option<String>> = Vec::new();
    for sheet in &wb.sheets {
        let mut cells_by_row: Vec<(u32, Vec<&GenCell>)> = Vec::new();
        let mut sorted: Vec<&GenCell> = sheet.cells.iter().collect();
        sorted.sort_by_key(|c| (c.row, c.col));
        for cell in sorted {
            if cells_by_row.last().map(|(r, _)| *r) != Some(cell.row) {
                cells_by_row.push((cell.row, Vec::new()));
            }
            if let Some((_, v)) = cells_by_row.last_mut() {
                v.push(cell);
            }
        }

        let mut xml = String::new();
        xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        xml.push_str("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">");
        if let Some(dim) = &sheet.dimension_override {
            let _ = write!(xml, "<dimension ref=\"{}\"/>", xml_escape(dim));
        }
        if sheet.frozen != (0, 0) {
            let (frows, fcols) = sheet.frozen;
            let top_left = a1(frows, fcols);
            let _ = write!(
                xml,
                "<sheetViews><sheetView workbookViewId=\"0\"><pane xSplit=\"{fcols}\" ySplit=\"{frows}\" topLeftCell=\"{top_left}\" state=\"frozen\"/></sheetView></sheetViews>"
            );
        }
        if !sheet.col_widths.is_empty() || !sheet.hidden_cols.is_empty() {
            xml.push_str("<cols>");
            for &(col, w) in &sheet.col_widths {
                let _ = write!(
                    xml,
                    "<col min=\"{0}\" max=\"{0}\" width=\"{1}\" customWidth=\"1\"/>",
                    col + 1,
                    w
                );
            }
            for &col in &sheet.hidden_cols {
                let _ = write!(
                    xml,
                    "<col min=\"{0}\" max=\"{0}\" width=\"0\" hidden=\"1\"/>",
                    col + 1
                );
            }
            xml.push_str("</cols>");
        }
        xml.push_str("<sheetData>");
        for (row, cells) in &cells_by_row {
            let mut row_attrs = format!(" r=\"{}\"", row + 1);
            if let Some(&(_, h)) = sheet.row_heights.iter().find(|(r, _)| r == row) {
                let _ = write!(row_attrs, " ht=\"{h}\" customHeight=\"1\"");
            }
            if sheet.hidden_rows.contains(row) {
                row_attrs.push_str(" hidden=\"1\"");
            }
            let _ = write!(xml, "<row{row_attrs}>");
            for cell in cells {
                let r = a1(cell.row, cell.col);
                let style_attr = if cell.style != 0 {
                    format!(" s=\"{}\"", cell.style)
                } else {
                    String::new()
                };
                match &cell.value {
                    GenValue::Number(v) => {
                        let _ = write!(xml, "<c r=\"{r}\"{style_attr}><v>{}</v></c>", num_str(*v));
                    }
                    GenValue::SharedStr(s) => {
                        let idx = shared_index(s, &mut shared);
                        let _ = write!(xml, "<c r=\"{r}\"{style_attr} t=\"s\"><v>{idx}</v></c>");
                    }
                    GenValue::InlineStr(s) => {
                        let _ = write!(
                            xml,
                            "<c r=\"{r}\"{style_attr} t=\"inlineStr\"><is><t xml:space=\"preserve\">{}</t></is></c>",
                            xml_escape(s)
                        );
                    }
                    GenValue::Bool(b) => {
                        let _ = write!(
                            xml,
                            "<c r=\"{r}\"{style_attr} t=\"b\"><v>{}</v></c>",
                            if *b { 1 } else { 0 }
                        );
                    }
                    GenValue::Error(e) => {
                        let _ = write!(
                            xml,
                            "<c r=\"{r}\"{style_attr} t=\"e\"><v>{}</v></c>",
                            xml_escape(e)
                        );
                    }
                    GenValue::Formula { formula, cached } => match cached.as_ref() {
                        GenValue::Number(v) => {
                            let _ = write!(
                                xml,
                                "<c r=\"{r}\"{style_attr}><f>{}</f><v>{}</v></c>",
                                xml_escape(formula),
                                num_str(*v)
                            );
                        }
                        GenValue::Bool(b) => {
                            let _ = write!(
                                xml,
                                "<c r=\"{r}\"{style_attr} t=\"b\"><f>{}</f><v>{}</v></c>",
                                xml_escape(formula),
                                if *b { 1 } else { 0 }
                            );
                        }
                        GenValue::Error(e) => {
                            let _ = write!(
                                xml,
                                "<c r=\"{r}\"{style_attr} t=\"e\"><f>{}</f><v>{}</v></c>",
                                xml_escape(formula),
                                xml_escape(e)
                            );
                        }
                        _ => {
                            let text = match cached.as_ref() {
                                GenValue::SharedStr(s) | GenValue::InlineStr(s) => s.clone(),
                                _ => String::new(),
                            };
                            let _ = write!(
                                xml,
                                "<c r=\"{r}\"{style_attr} t=\"str\"><f>{}</f><v>{}</v></c>",
                                xml_escape(formula),
                                xml_escape(&text)
                            );
                        }
                    },
                }
            }
            xml.push_str("</row>");
        }
        xml.push_str("</sheetData>");
        if !sheet.merges.is_empty() {
            let _ = write!(xml, "<mergeCells count=\"{}\">", sheet.merges.len());
            for m in &sheet.merges {
                let _ = write!(xml, "<mergeCell ref=\"{}\"/>", xml_escape(m));
            }
            xml.push_str("</mergeCells>");
        }
        if !sheet.hyperlinks.is_empty() {
            xml.push_str("<hyperlinks>");
            let mut rels = String::new();
            rels.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
            rels.push_str("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
            let mut external_count = 0u32;
            for h in &sheet.hyperlinks {
                let tooltip = h
                    .tooltip
                    .as_ref()
                    .map(|t| format!(" tooltip=\"{}\"", xml_escape(t)))
                    .unwrap_or_default();
                if let Some(target) = &h.target {
                    external_count += 1;
                    let rid = format!("rIdHl{external_count}");
                    let _ = write!(
                        xml,
                        "<hyperlink ref=\"{}\" r:id=\"{rid}\"{tooltip}/>",
                        xml_escape(&h.ref_range)
                    );
                    let _ = write!(
                        rels,
                        "<Relationship Id=\"{rid}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\"{}\" TargetMode=\"External\"/>",
                        xml_escape(target)
                    );
                } else if let Some(location) = &h.location {
                    let _ = write!(
                        xml,
                        "<hyperlink ref=\"{}\" location=\"{}\"{tooltip}/>",
                        xml_escape(&h.ref_range),
                        xml_escape(location)
                    );
                }
            }
            rels.push_str("</Relationships>");
            xml.push_str("</hyperlinks>");
            sheet_rels.push(if external_count > 0 { Some(rels) } else { None });
        } else {
            sheet_rels.push(None);
        }
        xml.push_str("</worksheet>");
        sheet_xmls.push(xml);
    }

    // sharedStrings.xml
    let mut sst = String::new();
    sst.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
    let _ = write!(
        sst,
        "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"{0}\" uniqueCount=\"{0}\">",
        shared.len()
    );
    for s in &shared {
        let _ = write!(
            sst,
            "<si><t xml:space=\"preserve\">{}</t></si>",
            xml_escape(s)
        );
    }
    sst.push_str("</sst>");

    // styles.xml
    let styles_xml = write_styles(&wb.styles);

    // workbook.xml
    let mut wb_xml = String::new();
    wb_xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
    wb_xml.push_str("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">");
    if wb.date1904 {
        wb_xml.push_str("<workbookPr date1904=\"1\"/>");
    }
    wb_xml.push_str("<sheets>");
    for (i, sheet) in wb.sheets.iter().enumerate() {
        let state = if sheet.state == "visible" {
            String::new()
        } else {
            format!(" state=\"{}\"", sheet.state)
        };
        let _ = write!(
            wb_xml,
            "<sheet name=\"{}\" sheetId=\"{}\"{} r:id=\"rId{}\"/>",
            xml_escape(&sheet.name),
            i + 1,
            state,
            i + 1
        );
    }
    wb_xml.push_str("</sheets></workbook>");

    // workbook rels
    let mut wb_rels = String::new();
    wb_rels.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
    wb_rels.push_str(
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
    );
    for i in 0..wb.sheets.len() {
        let _ = write!(
            wb_rels,
            "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{}.xml\"/>",
            i + 1,
            i + 1
        );
    }
    let next = wb.sheets.len();
    let _ = write!(
        wb_rels,
        "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings\" Target=\"sharedStrings.xml\"/>",
        next + 1
    );
    let _ = write!(
        wb_rels,
        "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>",
        next + 2
    );
    wb_rels.push_str("</Relationships>");

    // Root rels + content types.
    let root_rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
    let mut content_types = String::new();
    content_types.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
    content_types
        .push_str("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">");
    content_types.push_str("<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>");
    content_types.push_str("<Default Extension=\"xml\" ContentType=\"application/xml\"/>");
    content_types.push_str("<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>");
    for i in 0..wb.sheets.len() {
        let _ = write!(
            content_types,
            "<Override PartName=\"/xl/worksheets/sheet{}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>",
            i + 1
        );
    }
    content_types.push_str("<Override PartName=\"/xl/sharedStrings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml\"/>");
    content_types.push_str("<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>");
    content_types.push_str("</Types>");

    // Zip it up (fixed options; no timestamps — zip's default DOS time is the
    // 1980 epoch, deterministic without the `time` feature).
    let mut parts: Vec<(String, String)> = vec![
        ("[Content_Types].xml".to_string(), content_types),
        ("_rels/.rels".to_string(), root_rels.to_string()),
        ("xl/workbook.xml".to_string(), wb_xml),
        ("xl/_rels/workbook.xml.rels".to_string(), wb_rels),
        ("xl/sharedStrings.xml".to_string(), sst),
        ("xl/styles.xml".to_string(), styles_xml),
    ];
    for (i, xml) in sheet_xmls.into_iter().enumerate() {
        parts.push((format!("xl/worksheets/sheet{}.xml", i + 1), xml));
        if let Some(rels) = sheet_rels.get(i).and_then(|r| r.clone()) {
            parts.push((format!("xl/worksheets/_rels/sheet{}.xml.rels", i + 1), rels));
        }
    }
    zip_parts(&parts)
}

pub fn zip_parts(parts: &[(String, String)]) -> Vec<u8> {
    zip_binary_parts(
        &parts
            .iter()
            .map(|(n, c)| (n.clone(), c.as_bytes().to_vec()))
            .collect::<Vec<_>>(),
    )
}

pub fn zip_binary_parts(parts: &[(String, Vec<u8>)]) -> Vec<u8> {
    use std::io::Write;
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut writer = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, content) in parts {
            writer
                .start_file(name.clone(), options)
                .expect("zip start_file");
            writer.write_all(content).expect("zip write");
        }
        writer.finish().expect("zip finish");
    }
    cursor.into_inner()
}

fn write_styles(styles: &[GenStyle]) -> String {
    let mut custom_fmts: Vec<(u32, String)> = Vec::new();
    let mut fonts: Vec<String> =
        vec!["<font><sz val=\"11\"/><name val=\"Calibri\"/></font>".to_string()];
    let mut fills: Vec<String> = vec![
        "<fill><patternFill patternType=\"none\"/></fill>".to_string(),
        "<fill><patternFill patternType=\"gray125\"/></fill>".to_string(),
    ];
    let borders = "<border><left/><right/><top/><bottom/><diagonal/></border>".to_string();

    let mut xfs: Vec<String> = Vec::new();
    for (i, s) in styles.iter().enumerate() {
        let num_fmt_id = if let Some(code) = &s.num_fmt {
            let id = 164 + custom_fmts.len() as u32;
            match custom_fmts.iter().find(|(_, c)| c == code) {
                Some((existing, _)) => *existing,
                None => {
                    custom_fmts.push((id, code.clone()));
                    id
                }
            }
        } else {
            s.builtin_numfmt
        };
        let font_id = if s.bold || s.italic || s.font_rgb.is_some() {
            let mut f = String::from("<font>");
            if s.bold {
                f.push_str("<b/>");
            }
            if s.italic {
                f.push_str("<i/>");
            }
            f.push_str("<sz val=\"11\"/>");
            if let Some(rgb) = &s.font_rgb {
                let _ = write!(f, "<color rgb=\"{rgb}\"/>");
            }
            f.push_str("<name val=\"Calibri\"/></font>");
            match fonts.iter().position(|x| x == &f) {
                Some(p) => p,
                None => {
                    fonts.push(f);
                    fonts.len() - 1
                }
            }
        } else {
            0
        };
        let fill_id = if let Some(rgb) = &s.fill_rgb {
            let f = format!("<fill><patternFill patternType=\"solid\"><fgColor rgb=\"{rgb}\"/><bgColor indexed=\"64\"/></patternFill></fill>");
            match fills.iter().position(|x| x == &f) {
                Some(p) => p,
                None => {
                    fills.push(f);
                    fills.len() - 1
                }
            }
        } else {
            0
        };
        let mut align = String::new();
        if s.halign.is_some() || s.wrap {
            align.push_str("<alignment");
            if let Some(h) = &s.halign {
                let _ = write!(align, " horizontal=\"{h}\"");
            }
            if s.wrap {
                align.push_str(" wrapText=\"1\"");
            }
            align.push_str("/>");
        }
        let apply = if i == 0 {
            ""
        } else {
            " applyNumberFormat=\"1\""
        };
        if align.is_empty() {
            xfs.push(format!(
                "<xf numFmtId=\"{num_fmt_id}\" fontId=\"{font_id}\" fillId=\"{fill_id}\" borderId=\"0\"{apply}/>"
            ));
        } else {
            xfs.push(format!(
                "<xf numFmtId=\"{num_fmt_id}\" fontId=\"{font_id}\" fillId=\"{fill_id}\" borderId=\"0\"{apply} applyAlignment=\"1\">{align}</xf>"
            ));
        }
    }

    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
    xml.push_str(
        "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
    );
    if !custom_fmts.is_empty() {
        let _ = write!(xml, "<numFmts count=\"{}\">", custom_fmts.len());
        for (id, code) in &custom_fmts {
            let _ = write!(
                xml,
                "<numFmt numFmtId=\"{id}\" formatCode=\"{}\"/>",
                xml_escape(code)
            );
        }
        xml.push_str("</numFmts>");
    }
    let _ = write!(
        xml,
        "<fonts count=\"{}\">{}</fonts>",
        fonts.len(),
        fonts.concat()
    );
    let _ = write!(
        xml,
        "<fills count=\"{}\">{}</fills>",
        fills.len(),
        fills.concat()
    );
    let _ = write!(xml, "<borders count=\"1\">{borders}</borders>");
    xml.push_str("<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>");
    let _ = write!(
        xml,
        "<cellXfs count=\"{}\">{}</cellXfs>",
        xfs.len(),
        xfs.concat()
    );
    xml.push_str("</styleSheet>");
    xml
}

// ---------------------------------------------------------------------------
// Expected-values JSON (independent model -> JSON, never via parsing)
// ---------------------------------------------------------------------------

/// `{"date1904":..., "sheets":[{"name":..., "cells":[{"a1","t","v"}]}]}` with
/// cells sorted row-major. Types: n/s/b/e (formula cells report their cached
/// value's type; `t:"s"` covers shared, inline and formula-string).
pub fn expected_values_json(wb: &GenWorkbook) -> String {
    fn value_json(v: &GenValue) -> (char, serde_json::Value) {
        match v {
            GenValue::Number(n) => ('n', number_json(*n)),
            GenValue::SharedStr(s) | GenValue::InlineStr(s) => {
                ('s', serde_json::Value::String(s.clone()))
            }
            GenValue::Bool(b) => ('b', serde_json::Value::Bool(*b)),
            GenValue::Error(e) => ('e', serde_json::Value::String(e.clone())),
            GenValue::Formula { cached, .. } => value_json(cached),
        }
    }
    fn number_json(n: f64) -> serde_json::Value {
        if n.fract() == 0.0 && n.abs() < 9.0e15 {
            serde_json::json!(n as i64)
        } else {
            serde_json::json!(n)
        }
    }

    let sheets: Vec<serde_json::Value> = wb
        .sheets
        .iter()
        .map(|sheet| {
            let mut cells: Vec<&GenCell> = sheet.cells.iter().collect();
            cells.sort_by_key(|c| (c.row, c.col));
            // Last-wins on duplicates, matching reader convention.
            let mut deduped: Vec<&GenCell> = Vec::new();
            for c in cells {
                if deduped
                    .last()
                    .is_some_and(|p| p.row == c.row && p.col == c.col)
                {
                    deduped.pop();
                }
                deduped.push(c);
            }
            let cell_values: Vec<serde_json::Value> = deduped
                .iter()
                .map(|c| {
                    let (t, v) = value_json(&c.value);
                    serde_json::json!({ "a1": a1(c.row, c.col), "t": t.to_string(), "v": v })
                })
                .collect();
            serde_json::json!({ "name": sheet.name, "cells": cell_values })
        })
        .collect();

    let mut out = serde_json::to_string(&serde_json::json!({
        "date1904": wb.date1904,
        "sheets": sheets,
    }))
    .unwrap_or_default();
    out.push('\n');
    out
}
