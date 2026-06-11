//! ZIP container access. Parts decompress individually on demand; nothing is
//! extracted eagerly (spec §3.1).

use std::io::{Cursor, Read};

use zip::ZipArchive;

use crate::error::{EngineError, Result};

pub struct Container {
    archive: ZipArchive<Cursor<Vec<u8>>>,
    /// Decompressed-size ceiling per part, to defuse zip bombs: a worksheet
    /// part may be large, but a 4 GB part is never legitimate for us.
    max_part_bytes: u64,
}

/// One entry of a `.rels` part.
#[derive(Debug, Clone)]
pub struct Relationship {
    pub id: String,
    pub kind: String,
    pub target: String,
}

impl Container {
    pub fn open(bytes: Vec<u8>) -> Result<Container> {
        let archive = ZipArchive::new(Cursor::new(bytes))
            .map_err(|e| EngineError::Corrupt(format!("not a valid zip archive: {e}")))?;
        Ok(Container {
            archive,
            max_part_bytes: 2 * 1024 * 1024 * 1024,
        })
    }

    /// Read and decompress one part. Part names are normalized (leading `/`
    /// stripped). Returns `Corrupt` if missing or oversized.
    pub fn read_part(&mut self, name: &str) -> Result<Vec<u8>> {
        let normalized = name.trim_start_matches('/');
        let mut file = self
            .archive
            .by_name(normalized)
            .map_err(|e| EngineError::Corrupt(format!("missing zip part '{normalized}': {e}")))?;
        if file.size() > self.max_part_bytes {
            return Err(EngineError::Corrupt(format!(
                "zip part '{normalized}' decompresses to {} bytes (bomb?)",
                file.size()
            )));
        }
        let mut buf = Vec::with_capacity(file.size().min(64 * 1024 * 1024) as usize);
        // take() enforces the cap even when the local header lies about size.
        let mut limited = (&mut file).take(self.max_part_bytes + 1);
        limited.read_to_end(&mut buf).map_err(|e| {
            EngineError::Corrupt(format!("failed to decompress '{normalized}': {e}"))
        })?;
        if buf.len() as u64 > self.max_part_bytes {
            return Err(EngineError::Corrupt(format!(
                "zip part '{normalized}' exceeds size cap"
            )));
        }
        Ok(buf)
    }

    pub fn has_part(&mut self, name: &str) -> bool {
        self.archive.by_name(name.trim_start_matches('/')).is_ok()
    }

    /// Locate the workbook part via `_rels/.rels` (officeDocument relationship),
    /// falling back to the conventional `xl/workbook.xml`.
    pub fn resolve_workbook_part(&mut self) -> Result<Option<String>> {
        if let Ok(root_rels) = self.read_part("_rels/.rels") {
            let rels = parse_rels(&root_rels)?;
            if let Some(r) = rels.iter().find(|r| r.kind.ends_with("officeDocument")) {
                return Ok(Some(r.target.trim_start_matches('/').to_string()));
            }
        }
        if self.has_part("xl/workbook.xml") {
            return Ok(Some("xl/workbook.xml".to_string()));
        }
        Ok(None)
    }

    /// Relationships of `part` (from its sibling `_rels/<name>.rels`).
    pub fn read_rels_for(&mut self, part: &str) -> Result<Vec<Relationship>> {
        let (dir, file) = split_part(part);
        let rels_name = if dir.is_empty() {
            format!("_rels/{file}.rels")
        } else {
            format!("{dir}/_rels/{file}.rels")
        };
        match self.read_part(&rels_name) {
            Ok(bytes) => parse_rels(&bytes),
            Err(_) => Ok(Vec::new()),
        }
    }

    /// First relationship of `base_part` whose type contains `kind_fragment`,
    /// resolved to an absolute part name.
    pub fn find_related_part(
        &self,
        base_part: &str,
        rels: &[Relationship],
        kind_fragment: &str,
    ) -> Option<String> {
        rels.iter()
            .find(|r| r.kind.contains(kind_fragment))
            .map(|r| self.resolve_relative(base_part, &r.target))
    }

    /// Resolve a relationship target against the directory of `base_part`.
    pub fn resolve_relative(&self, base_part: &str, target: &str) -> String {
        if let Some(absolute) = target.strip_prefix('/') {
            return absolute.to_string();
        }
        let (dir, _) = split_part(base_part);
        let mut segments: Vec<&str> = if dir.is_empty() {
            Vec::new()
        } else {
            dir.split('/').collect()
        };
        for seg in target.split('/') {
            match seg {
                "." | "" => {}
                ".." => {
                    segments.pop();
                }
                s => segments.push(s),
            }
        }
        segments.join("/")
    }
}

fn split_part(part: &str) -> (&str, &str) {
    match part.rfind('/') {
        Some(i) => (&part[..i], &part[i + 1..]),
        None => ("", part),
    }
}

/// Parse a `.rels` XML document.
pub fn parse_rels(xml: &[u8]) -> Result<Vec<Relationship>> {
    use quick_xml::events::Event;

    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut out = Vec::new();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.local_name().as_ref() == b"Relationship" => {
                let mut id = String::new();
                let mut kind = String::new();
                let mut target = String::new();
                for attr in e.attributes().flatten() {
                    let value = attr.unescape_value().unwrap_or_default().into_owned();
                    match attr.key.as_ref() {
                        b"Id" => id = value,
                        b"Type" => kind = value,
                        b"Target" => target = value,
                        _ => {}
                    }
                }
                out.push(Relationship { id, kind, target });
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("bad rels xml: {e}"))),
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
    fn relative_resolution() {
        let c = Container::open(empty_zip()).unwrap();
        assert_eq!(
            c.resolve_relative("xl/workbook.xml", "worksheets/sheet1.xml"),
            "xl/worksheets/sheet1.xml"
        );
        assert_eq!(
            c.resolve_relative("xl/workbook.xml", "/xl/styles.xml"),
            "xl/styles.xml"
        );
        assert_eq!(
            c.resolve_relative("xl/workbook.xml", "../docProps/core.xml"),
            "docProps/core.xml"
        );
        assert_eq!(
            c.resolve_relative("workbook.xml", "sheet1.xml"),
            "sheet1.xml"
        );
    }

    #[test]
    fn rejects_garbage() {
        assert!(matches!(
            Container::open(b"not a zip at all".to_vec()),
            Err(EngineError::Corrupt(_))
        ));
    }

    fn empty_zip() -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            writer
                .start_file::<_, ()>("placeholder.txt", zip::write::FileOptions::default())
                .unwrap();
            std::io::Write::write_all(&mut writer, b"x").unwrap();
            writer.finish().unwrap();
        }
        cursor.into_inner()
    }
}
