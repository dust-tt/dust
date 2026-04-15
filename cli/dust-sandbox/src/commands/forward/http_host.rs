use super::DomainParseResult;

pub fn parse_http_host(bytes: &[u8]) -> DomainParseResult {
    let header_end = find_subslice(bytes, b"\r\n\r\n");
    let parse_end = header_end.map_or(bytes.len(), |index| index + 4);
    let header_bytes = &bytes[..parse_end];
    let header_text = match std::str::from_utf8(header_bytes) {
        Ok(text) => text,
        Err(_) => return DomainParseResult::NotFound,
    };

    for line in header_text.split("\r\n").skip(1) {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("host") {
                if header_end.is_none() {
                    return DomainParseResult::Incomplete;
                }
                let host = strip_port(value.trim());
                return if host.is_empty() {
                    DomainParseResult::NotFound
                } else {
                    DomainParseResult::Found(host.to_string())
                };
            }
        }
    }

    if header_end.is_some() {
        DomainParseResult::NotFound
    } else {
        DomainParseResult::Incomplete
    }
}

fn strip_port(host: &str) -> &str {
    if let Some(end_bracket) = host.find(']') {
        if host.starts_with('[') {
            return &host[1..end_bracket];
        }
    }

    if host.matches(':').count() == 1 {
        return host.split(':').next().unwrap_or(host);
    }

    host
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::super::DomainParseResult;
    use super::parse_http_host;

    #[test]
    fn parses_standard_host_header() {
        let request = b"GET / HTTP/1.1\r\nHost: example.com\r\nUser-Agent: curl\r\n\r\n";
        assert_eq!(
            parse_http_host(request),
            DomainParseResult::Found("example.com".to_string())
        );
    }

    #[test]
    fn parses_host_header_case_insensitively() {
        let lowercase = b"GET / HTTP/1.1\r\nhost: lowercase.example\r\n\r\n";
        let uppercase = b"GET / HTTP/1.1\r\nHOST: uppercase.example\r\n\r\n";

        assert_eq!(
            parse_http_host(lowercase),
            DomainParseResult::Found("lowercase.example".to_string())
        );
        assert_eq!(
            parse_http_host(uppercase),
            DomainParseResult::Found("uppercase.example".to_string())
        );
    }

    #[test]
    fn strips_port_from_host_header() {
        let request = b"GET / HTTP/1.1\r\nHost: example.com:8080\r\n\r\n";
        assert_eq!(
            parse_http_host(request),
            DomainParseResult::Found("example.com".to_string())
        );
    }

    #[test]
    fn returns_not_found_when_host_header_is_missing() {
        let request = b"GET / HTTP/1.1\r\nUser-Agent: curl\r\n\r\n";
        assert_eq!(parse_http_host(request), DomainParseResult::NotFound);
    }

    #[test]
    fn returns_incomplete_for_partial_headers() {
        let request = b"GET / HTTP/1.1\r\nUser-Agent: curl\r\n";
        assert_eq!(parse_http_host(request), DomainParseResult::Incomplete);
    }

    #[test]
    fn returns_incomplete_for_partial_host_header_line() {
        let request = b"GET / HTTP/1.1\r\nHost: api.op";
        assert_eq!(parse_http_host(request), DomainParseResult::Incomplete);
    }
}
