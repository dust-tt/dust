// Keep these constants and frame layout in sync with egress-proxy/src/handshake.rs.
pub const PROTOCOL_VERSION: u8 = 0x01;
pub const ALLOW_RESPONSE: u8 = 0x00;
pub const DENY_RESPONSE: u8 = 0x01;

pub fn build_handshake_frame(token: &str, domain: &str, original_dest_port: u16) -> Vec<u8> {
    let token_bytes = token.as_bytes();
    let domain_bytes = domain.as_bytes();
    let token_len =
        u16::try_from(token_bytes.len()).expect("token length should fit in the wire format");
    let domain_len =
        u16::try_from(domain_bytes.len()).expect("domain length should fit in the wire format");

    let mut frame = Vec::with_capacity(1 + 2 + token_bytes.len() + 2 + domain_bytes.len() + 2);
    frame.push(PROTOCOL_VERSION);
    frame.extend_from_slice(&token_len.to_be_bytes());
    frame.extend_from_slice(token_bytes);
    frame.extend_from_slice(&domain_len.to_be_bytes());
    frame.extend_from_slice(domain_bytes);
    frame.extend_from_slice(&original_dest_port.to_be_bytes());
    frame
}

#[cfg(test)]
mod tests {
    use super::{build_handshake_frame, ALLOW_RESPONSE, DENY_RESPONSE, PROTOCOL_VERSION};

    #[test]
    fn encodes_handshake_frame_in_proxy_wire_format() {
        let frame = build_handshake_frame("token", "example.com", 443);

        assert_eq!(
            frame,
            vec![
                PROTOCOL_VERSION,
                0x00,
                0x05,
                b't',
                b'o',
                b'k',
                b'e',
                b'n',
                0x00,
                0x0b,
                b'e',
                b'x',
                b'a',
                b'm',
                b'p',
                b'l',
                b'e',
                b'.',
                b'c',
                b'o',
                b'm',
                0x01,
                0xbb
            ]
        );
        assert_eq!(ALLOW_RESPONSE, 0x00);
        assert_eq!(DENY_RESPONSE, 0x01);
    }
}
