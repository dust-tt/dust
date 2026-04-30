/// Phase 0 byte-level header rewriter.
///
/// Scans HTTP/1.1 request bytes for the literal placeholder
/// `__DUST_EXPERIMENT_PLACEHOLDER__` (31 bytes) and replaces it with
/// `__SUCCESSFULLY_REPLACED________` (also 31 bytes, padded with trailing
/// underscores so framing — Content-Length, header offsets — is preserved
/// without recomputation). The replacement is unconditional and not gated
/// on header name; the only guard is that the byte sequence appears.
pub const PHASE0_PLACEHOLDER: &[u8] = b"__DUST_EXPERIMENT_PLACEHOLDER__";
pub const PHASE0_REPLACEMENT: &[u8] = b"__SUCCESSFULLY_REPLACED________";

const _PLACEHOLDER_LEN_CHECK: () = {
    assert!(PHASE0_PLACEHOLDER.len() == PHASE0_REPLACEMENT.len());
};

/// Replace every occurrence of `PHASE0_PLACEHOLDER` in `buf` with
/// `PHASE0_REPLACEMENT`, in place. Returns the number of replacements made.
pub fn rewrite_in_place(buf: &mut [u8]) -> usize {
    if buf.len() < PHASE0_PLACEHOLDER.len() {
        return 0;
    }

    let needle = PHASE0_PLACEHOLDER;
    let replacement = PHASE0_REPLACEMENT;
    let mut count = 0usize;
    let mut i = 0usize;

    while i + needle.len() <= buf.len() {
        if &buf[i..i + needle.len()] == needle {
            buf[i..i + replacement.len()].copy_from_slice(replacement);
            count += 1;
            i += needle.len();
        } else {
            i += 1;
        }
    }

    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_and_replacement_have_equal_length() {
        assert_eq!(PHASE0_PLACEHOLDER.len(), PHASE0_REPLACEMENT.len());
    }

    #[test]
    fn rewrites_placeholder_in_authorization_header() {
        let mut buf = b"GET / HTTP/1.1\r\nHost: dust.tt\r\nX-Dust-Experiment: __DUST_EXPERIMENT_PLACEHOLDER__\r\n\r\n".to_vec();
        let count = rewrite_in_place(&mut buf);
        assert_eq!(count, 1);
        assert!(buf
            .windows(PHASE0_REPLACEMENT.len())
            .any(|w| w == PHASE0_REPLACEMENT));
        assert!(!buf
            .windows(PHASE0_PLACEHOLDER.len())
            .any(|w| w == PHASE0_PLACEHOLDER));
    }

    #[test]
    fn leaves_unrelated_bytes_untouched() {
        let original = b"GET / HTTP/1.1\r\nHost: dust.tt\r\nX-Dust-Experiment: literal-not-the-placeholder\r\n\r\n".to_vec();
        let mut buf = original.clone();
        let count = rewrite_in_place(&mut buf);
        assert_eq!(count, 0);
        assert_eq!(buf, original);
    }

    #[test]
    fn rewrites_multiple_occurrences() {
        let mut buf =
            b"X1: __DUST_EXPERIMENT_PLACEHOLDER__ X2: __DUST_EXPERIMENT_PLACEHOLDER__".to_vec();
        let count = rewrite_in_place(&mut buf);
        assert_eq!(count, 2);
    }

    #[test]
    fn no_op_on_short_buffer() {
        let mut buf = b"GET /".to_vec();
        assert_eq!(rewrite_in_place(&mut buf), 0);
    }
}
