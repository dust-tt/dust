use super::DomainParseResult;

pub fn parse_client_hello_sni(bytes: &[u8]) -> DomainParseResult {
    let record = match bytes.get(..5) {
        Some(record) => record,
        None => return DomainParseResult::Incomplete,
    };

    if record[0] != 0x16 {
        return DomainParseResult::NotFound;
    }

    let record_len = read_u16(&record[3..5]) as usize;
    let record_payload = match bytes.get(5..5 + record_len) {
        Some(payload) => payload,
        None => return DomainParseResult::Incomplete,
    };

    if record_payload.is_empty() || record_payload[0] != 0x01 {
        return DomainParseResult::NotFound;
    }

    let hello_len = read_u24(&record_payload[1..4]) as usize;
    let client_hello = match record_payload.get(4..4 + hello_len) {
        Some(hello) => hello,
        None => return DomainParseResult::Incomplete,
    };

    match parse_server_name_extension(client_hello) {
        Some(hostname) => DomainParseResult::Found(hostname),
        None => DomainParseResult::NotFound,
    }
}

fn parse_server_name_extension(client_hello: &[u8]) -> Option<String> {
    let mut cursor = Cursor::new(client_hello);

    cursor.take(2)?;
    cursor.take(32)?;
    let session_id_len = cursor.take_u8()? as usize;
    cursor.take(session_id_len)?;

    let cipher_suites_len = cursor.take_u16()? as usize;
    cursor.take(cipher_suites_len)?;

    let compression_methods_len = cursor.take_u8()? as usize;
    cursor.take(compression_methods_len)?;

    let extensions_len = cursor.take_u16()? as usize;
    let mut extensions = Cursor::new(cursor.take(extensions_len)?);

    while !extensions.is_empty() {
        let extension_type = extensions.take_u16()?;
        let extension_len = extensions.take_u16()? as usize;
        let extension = extensions.take(extension_len)?;

        if extension_type == 0x0000 {
            return parse_sni_extension(extension);
        }
    }

    None
}

fn parse_sni_extension(extension: &[u8]) -> Option<String> {
    let mut cursor = Cursor::new(extension);
    let server_name_list_len = cursor.take_u16()? as usize;
    let mut server_names = Cursor::new(cursor.take(server_name_list_len)?);

    while !server_names.is_empty() {
        let name_type = server_names.take_u8()?;
        let name_len = server_names.take_u16()? as usize;
        let name = server_names.take(name_len)?;

        if name_type == 0x00 {
            let hostname = std::str::from_utf8(name).ok()?.to_string();
            return Some(hostname);
        }
    }

    None
}

struct Cursor<'a> {
    remaining: &'a [u8],
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { remaining: bytes }
    }

    fn is_empty(&self) -> bool {
        self.remaining.is_empty()
    }

    fn take(&mut self, len: usize) -> Option<&'a [u8]> {
        let bytes = self.remaining.get(..len)?;
        self.remaining = &self.remaining[len..];
        Some(bytes)
    }

    fn take_u8(&mut self) -> Option<u8> {
        Some(*self.take(1)?.first()?)
    }

    fn take_u16(&mut self) -> Option<u16> {
        Some(read_u16(self.take(2)?))
    }
}

fn read_u16(bytes: &[u8]) -> u16 {
    u16::from_be_bytes([bytes[0], bytes[1]])
}

fn read_u24(bytes: &[u8]) -> u32 {
    ((bytes[0] as u32) << 16) | ((bytes[1] as u32) << 8) | bytes[2] as u32
}

#[cfg(test)]
mod tests {
    use super::super::DomainParseResult;
    use super::parse_client_hello_sni;

    #[test]
    fn parses_sni_from_client_hello() {
        let hello = build_client_hello(Some("api.openai.com"));
        assert_eq!(
            parse_client_hello_sni(&hello),
            DomainParseResult::Found("api.openai.com".to_string())
        );
    }

    #[test]
    fn returns_not_found_when_sni_extension_is_missing() {
        let hello = build_client_hello(None);
        assert_eq!(parse_client_hello_sni(&hello), DomainParseResult::NotFound);
    }

    #[test]
    fn returns_incomplete_for_truncated_record() {
        let hello = build_client_hello(Some("api.openai.com"));
        let truncated = &hello[..10];
        assert_eq!(
            parse_client_hello_sni(truncated),
            DomainParseResult::Incomplete
        );
    }

    #[test]
    fn returns_not_found_for_non_tls_bytes() {
        assert_eq!(
            parse_client_hello_sni(b"GET / HTTP/1.1\r\n\r\n"),
            DomainParseResult::NotFound
        );
    }

    fn build_client_hello(server_name: Option<&str>) -> Vec<u8> {
        let mut client_hello = Vec::new();
        client_hello.extend_from_slice(&[0x03, 0x03]);
        client_hello.extend_from_slice(&[0_u8; 32]);
        client_hello.push(0x00);
        client_hello.extend_from_slice(&2_u16.to_be_bytes());
        client_hello.extend_from_slice(&[0x13, 0x01]);
        client_hello.push(0x01);
        client_hello.push(0x00);

        let extensions = if let Some(server_name) = server_name {
            build_sni_extension(server_name)
        } else {
            Vec::new()
        };
        client_hello.extend_from_slice(&(extensions.len() as u16).to_be_bytes());
        client_hello.extend_from_slice(&extensions);

        let mut handshake = Vec::new();
        handshake.push(0x01);
        let hello_len = client_hello.len() as u32;
        handshake.extend_from_slice(&[
            ((hello_len >> 16) & 0xff) as u8,
            ((hello_len >> 8) & 0xff) as u8,
            (hello_len & 0xff) as u8,
        ]);
        handshake.extend_from_slice(&client_hello);

        let mut record = Vec::new();
        record.push(0x16);
        record.extend_from_slice(&[0x03, 0x01]);
        record.extend_from_slice(&(handshake.len() as u16).to_be_bytes());
        record.extend_from_slice(&handshake);
        record
    }

    fn build_sni_extension(server_name: &str) -> Vec<u8> {
        let server_name_bytes = server_name.as_bytes();
        let server_name_entry_len = 1 + 2 + server_name_bytes.len();
        let server_name_list_len = server_name_entry_len as u16;
        let extension_payload_len = 2 + server_name_entry_len;

        let mut extension = Vec::new();
        extension.extend_from_slice(&0x0000_u16.to_be_bytes());
        extension.extend_from_slice(&(extension_payload_len as u16).to_be_bytes());
        extension.extend_from_slice(&server_name_list_len.to_be_bytes());
        extension.push(0x00);
        extension.extend_from_slice(&(server_name_bytes.len() as u16).to_be_bytes());
        extension.extend_from_slice(server_name_bytes);
        extension
    }
}
