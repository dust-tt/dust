//! `xl/sharedStrings.xml`: each `<si>` is one shared string; rich-text runs
//! (`<r><t>`) concatenate; phonetic runs (`<rPh>`) are excluded (classic gotcha).

use quick_xml::events::Event;

use crate::error::{EngineError, Result};
use crate::workbook::SharedStrings;

pub fn parse_shared_strings(xml: &[u8]) -> Result<SharedStrings> {
    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut out = SharedStrings::default();
    let mut buf = Vec::new();

    let mut in_si = false;
    let mut in_phonetic = false;
    let mut in_t = false;
    let mut current = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"si" => {
                    in_si = true;
                    current.clear();
                }
                b"rPh" => in_phonetic = true,
                b"t" if in_si && !in_phonetic => in_t = true,
                _ => {}
            },
            Ok(Event::Text(t)) if in_t => {
                current.push_str(
                    &t.unescape().map_err(|e| {
                        EngineError::Corrupt(format!("bad sharedStrings text: {e}"))
                    })?,
                );
            }
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"t" => in_t = false,
                b"rPh" => in_phonetic = false,
                b"si" => {
                    in_si = false;
                    out.push(&current);
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("bad sharedStrings.xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_rich_and_phonetic() {
        let xml = br#"<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>plain</t></si>
  <si><r><t>ri</t></r><r><rPr><b/></rPr><t>ch</t></r></si>
  <si><t>base</t><rPh sb="0" eb="1"><t>PHONETIC</t></rPh></si>
</sst>"#;
        let s = parse_shared_strings(xml).unwrap();
        assert_eq!(s.len(), 3);
        assert_eq!(s.get(0), Some("plain"));
        assert_eq!(s.get(1), Some("rich"));
        assert_eq!(s.get(2), Some("base"), "phonetic runs must be excluded");
        assert_eq!(s.get(3), None);
    }

    #[test]
    fn preserves_whitespace_and_entities() {
        let xml = br#"<sst><si><t xml:space="preserve">  a&amp;b  </t></si></sst>"#;
        let s = parse_shared_strings(xml).unwrap();
        assert_eq!(s.get(0), Some("  a&b  "));
    }
}
