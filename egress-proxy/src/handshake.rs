// TODO(sandbox-egress): Remove this allowance in the next PR when the proxy listener starts
// reading real sandbox handshakes.
#![allow(dead_code)]

use crate::domain::{normalize_domain_or_ip, DomainValidationError};
use thiserror::Error;
use tokio::io::{AsyncRead, AsyncReadExt};

pub const PROTOCOL_VERSION: u8 = 0x01;
pub const ALLOW_RESPONSE: u8 = 0x00;
pub const DENY_RESPONSE: u8 = 0x01;

const MAX_TOKEN_LENGTH: usize = 16 * 1024;
const MAX_DOMAIN_LENGTH: usize = 253;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Handshake {
    pub token: String,
    pub domain: String,
    pub original_dest_port: u16,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum HandshakeError {
    #[error("malformed handshake")]
    MalformedHandshake,
    #[error("truncated handshake")]
    TruncatedHandshake,
    #[error("unsupported protocol version")]
    UnsupportedProtocolVersion,
}

pub async fn read_handshake<R>(reader: &mut R) -> Result<Handshake, HandshakeError>
where
    R: AsyncRead + Unpin,
{
    // TODO(sandbox-egress): Keep this protocol parser in sync with dsbx forward when the
    // in-sandbox forwarder is implemented.
    let version = read_u8(reader).await?;
    if version != PROTOCOL_VERSION {
        return Err(HandshakeError::UnsupportedProtocolVersion);
    }

    let token_length = read_u16(reader).await?;
    if token_length == 0 || usize::from(token_length) > MAX_TOKEN_LENGTH {
        return Err(HandshakeError::MalformedHandshake);
    }

    let token_bytes = read_bytes(reader, usize::from(token_length)).await?;
    let token = String::from_utf8(token_bytes).map_err(|_| HandshakeError::MalformedHandshake)?;

    let domain_length = read_u16(reader).await?;
    if usize::from(domain_length) > MAX_DOMAIN_LENGTH {
        return Err(HandshakeError::MalformedHandshake);
    }

    let domain_bytes = read_bytes(reader, usize::from(domain_length)).await?;
    let raw_domain =
        String::from_utf8(domain_bytes).map_err(|_| HandshakeError::MalformedHandshake)?;
    let domain = normalize_domain(&raw_domain)?;

    let original_dest_port = read_u16(reader).await?;
    if original_dest_port == 0 {
        return Err(HandshakeError::MalformedHandshake);
    }

    Ok(Handshake {
        token,
        domain,
        original_dest_port,
    })
}

#[cfg(test)]
pub fn build_frame(token: &str, domain: &str, original_dest_port: u16) -> Vec<u8> {
    let token_bytes = token.as_bytes();
    let domain_bytes = domain.as_bytes();
    let token_length =
        u16::try_from(token_bytes.len()).expect("test token length should fit in u16");
    let domain_length =
        u16::try_from(domain_bytes.len()).expect("test domain length should fit in u16");
    let mut frame = Vec::with_capacity(1 + 2 + token_bytes.len() + 2 + domain_bytes.len() + 2);

    frame.push(PROTOCOL_VERSION);
    frame.extend_from_slice(&token_length.to_be_bytes());
    frame.extend_from_slice(token_bytes);
    frame.extend_from_slice(&domain_length.to_be_bytes());
    frame.extend_from_slice(domain_bytes);
    frame.extend_from_slice(&original_dest_port.to_be_bytes());

    frame
}

fn normalize_domain(domain: &str) -> Result<String, HandshakeError> {
    if domain.is_empty() {
        return Ok(String::new());
    }

    match normalize_domain_or_ip(domain) {
        Ok(domain) => Ok(domain),
        Err(DomainValidationError::Empty) => Err(HandshakeError::MalformedHandshake),
        Err(DomainValidationError::Invalid) => Err(HandshakeError::MalformedHandshake),
    }
}

async fn read_u8<R>(reader: &mut R) -> Result<u8, HandshakeError>
where
    R: AsyncRead + Unpin,
{
    let mut buffer = [0; 1];
    reader
        .read_exact(&mut buffer)
        .await
        .map_err(|_| HandshakeError::TruncatedHandshake)?;
    Ok(buffer[0])
}

async fn read_u16<R>(reader: &mut R) -> Result<u16, HandshakeError>
where
    R: AsyncRead + Unpin,
{
    let mut buffer = [0; 2];
    reader
        .read_exact(&mut buffer)
        .await
        .map_err(|_| HandshakeError::TruncatedHandshake)?;
    Ok(u16::from_be_bytes(buffer))
}

async fn read_bytes<R>(reader: &mut R, length: usize) -> Result<Vec<u8>, HandshakeError>
where
    R: AsyncRead + Unpin,
{
    let mut buffer = vec![0; length];
    reader
        .read_exact(&mut buffer)
        .await
        .map_err(|_| HandshakeError::TruncatedHandshake)?;
    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::{build_frame, read_handshake, HandshakeError, PROTOCOL_VERSION};

    #[tokio::test]
    async fn parses_valid_handshake() {
        let frame = build_frame("token", "Example.COM.", 443);
        let mut reader = frame.as_slice();
        let handshake = read_handshake(&mut reader)
            .await
            .expect("valid handshake frame should parse");

        assert_eq!(handshake.token, "token");
        assert_eq!(handshake.domain, "example.com");
        assert_eq!(handshake.original_dest_port, 443);
    }

    #[tokio::test]
    async fn accepts_empty_domain() {
        let frame = build_frame("token", "", 443);
        let mut reader = frame.as_slice();
        let handshake = read_handshake(&mut reader)
            .await
            .expect("empty domain is valid in the wire protocol");

        assert_eq!(handshake.domain, "");
    }

    #[tokio::test]
    async fn rejects_unsupported_version() {
        let mut frame = build_frame("token", "example.com", 443);
        frame[0] = PROTOCOL_VERSION + 1;
        let mut reader = frame.as_slice();

        assert_eq!(
            read_handshake(&mut reader).await.unwrap_err(),
            HandshakeError::UnsupportedProtocolVersion
        );
    }

    #[tokio::test]
    async fn rejects_truncated_handshake() {
        let frame = [PROTOCOL_VERSION, 0x00];
        let mut reader = frame.as_slice();

        assert_eq!(
            read_handshake(&mut reader).await.unwrap_err(),
            HandshakeError::TruncatedHandshake
        );
    }

    #[tokio::test]
    async fn rejects_complete_malformed_handshakes() {
        for frame in [
            build_frame("", "example.com", 443),
            build_frame("token", " example.com", 443),
            build_frame("token", "example..com", 443),
            build_frame("token", "host:443", 443),
            build_frame("token", ".", 443),
            build_frame("token", "example.com", 0),
        ] {
            let mut reader = frame.as_slice();

            assert_eq!(
                read_handshake(&mut reader).await.unwrap_err(),
                HandshakeError::MalformedHandshake
            );
        }
    }
}
