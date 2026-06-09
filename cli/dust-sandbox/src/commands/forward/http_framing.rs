use std::fmt;
use std::num::ParseIntError;
use std::str::Utf8Error;

// Limits are intentionally generous compared to nginx/Apache defaults
// (~8-32 KiB / ~100 headers). This rewriter sits in front of arbitrary
// outbound HTTP traffic from the sandbox (curl, git, package managers,
// browsers, anything), so the role of these limits is to bound our own
// memory use and reject obviously-malformed traffic, not to enforce a
// policy on what the destination accepts.
pub(super) const MAX_HEADER_BLOCK_BYTES: usize = 64 * 1024;
pub(super) const MAX_HEADER_LINE_BYTES: usize = 16 * 1024;
pub(super) const MAX_TRAILER_BLOCK_BYTES: usize = 64 * 1024;
pub(super) const READ_CHUNK_BYTES: usize = 8 * 1024;

#[derive(Debug)]
pub(super) enum ParseChunkError {
    InvalidUtf8(Utf8Error),
    MissingCrlf,
    InvalidSize(ParseIntError),
}

impl fmt::Display for ParseChunkError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidUtf8(error) => write!(formatter, "chunk size line is not utf8: {error}"),
            Self::MissingCrlf => write!(formatter, "chunk size line missing CRLF"),
            Self::InvalidSize(error) => write!(formatter, "invalid chunk size: {error}"),
        }
    }
}

impl std::error::Error for ParseChunkError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidUtf8(error) => Some(error),
            Self::MissingCrlf => None,
            Self::InvalidSize(error) => Some(error),
        }
    }
}

pub(super) fn parse_chunk_size(line: &[u8]) -> Result<usize, ParseChunkError> {
    let text = std::str::from_utf8(line).map_err(ParseChunkError::InvalidUtf8)?;
    let line = text
        .strip_suffix("\r\n")
        .ok_or(ParseChunkError::MissingCrlf)?;
    let size = line.split_once(';').map_or(line, |(size, _)| size).trim();
    usize::from_str_radix(size, 16).map_err(ParseChunkError::InvalidSize)
}

pub(super) fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

// Hop-by-hop headers we strip when re-serializing a bridged request or response.
// Connection, Keep-Alive, Proxy-Connection, Transfer-Encoding, and Upgrade are
// hop-by-hop per RFC 7230. Host is stripped because we re-set it from the
// bridged authority.
const COMMON_STRIPPED_HEADERS: &[&str] = &[
    "connection",
    "host",
    "keep-alive",
    "proxy-connection",
    "transfer-encoding",
    "upgrade",
];

pub(super) fn is_common_bridge_stripped_header(name: &str) -> bool {
    COMMON_STRIPPED_HEADERS
        .iter()
        .any(|stripped| name.eq_ignore_ascii_case(stripped))
}

// h2-to-h1 fallback strips TE in addition to the common set. TE is an
// h1-specific hop-by-hop header and should not be forwarded raw.
pub(super) fn is_h1_bridge_stripped_header(name: &str) -> bool {
    is_common_bridge_stripped_header(name) || name.eq_ignore_ascii_case("te")
}

#[cfg(test)]
mod tests {
    use super::{
        find_subslice, is_common_bridge_stripped_header, parse_chunk_size, ParseChunkError,
    };

    #[test]
    fn parses_chunk_sizes() -> anyhow::Result<()> {
        assert_eq!(parse_chunk_size(b"0\r\n")?, 0);
        assert_eq!(parse_chunk_size(b"1a\r\n")?, 26);
        assert_eq!(parse_chunk_size(b"1A\r\n")?, 26);
        assert_eq!(parse_chunk_size(b"f;foo=bar\r\n")?, 15);
        assert_eq!(parse_chunk_size(b" f ; foo=bar\r\n")?, 15);
        Ok(())
    }

    #[test]
    fn rejects_chunk_sizes_without_crlf() {
        assert!(matches!(
            parse_chunk_size(b"1a"),
            Err(ParseChunkError::MissingCrlf)
        ));
    }

    #[test]
    fn rejects_invalid_chunk_sizes() {
        assert!(matches!(
            parse_chunk_size(b"1a garbage\r\n"),
            Err(ParseChunkError::InvalidSize(_))
        ));
    }

    #[test]
    fn rejects_non_utf8_chunk_sizes() {
        assert!(matches!(
            parse_chunk_size(&[0xff, b'\r', b'\n']),
            Err(ParseChunkError::InvalidUtf8(_))
        ));
    }

    #[test]
    fn finds_subslices() {
        assert_eq!(find_subslice(b"abc", b"x"), None);
        assert_eq!(find_subslice(b"abc", b"ab"), Some(0));
        assert_eq!(find_subslice(b"abc", b"bc"), Some(1));
        assert_eq!(find_subslice(b"ababa", b"aba"), Some(0));
    }

    #[test]
    #[should_panic]
    fn empty_subslice_needle_matches_previous_behavior() {
        let _ = find_subslice(b"abc", b"");
    }

    #[test]
    fn classifies_common_bridge_stripped_headers() {
        for name in [
            "connection",
            "HOST",
            "keep-alive",
            "proxy-connection",
            "transfer-encoding",
            "upgrade",
        ] {
            assert!(is_common_bridge_stripped_header(name));
        }

        for name in ["te", "cookie", "authorization", "x-foo"] {
            assert!(!is_common_bridge_stripped_header(name));
        }
    }
}
