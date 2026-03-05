use anyhow::{bail, Context};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Deserialize;

pub const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";

#[derive(Debug, Deserialize)]
pub struct SandboxClaims {
    #[serde(rename = "wId")]
    pub w_id: String,
    #[serde(rename = "cId")]
    pub c_id: String,
    #[serde(rename = "uId")]
    pub u_id: String,
    #[serde(rename = "sbId")]
    pub sb_id: String,
    #[serde(default)]
    pub exp: Option<u64>,
}

pub fn decode_jwt_claims(token: &str) -> anyhow::Result<SandboxClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        bail!("invalid JWT: expected 3 parts, got {}", parts.len());
    }
    let payload = URL_SAFE_NO_PAD
        .decode(parts[1])
        .context("failed to base64-decode JWT payload")?;
    let claims: SandboxClaims =
        serde_json::from_slice(&payload).context("failed to parse JWT claims")?;
    Ok(claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_valid_token() {
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload = URL_SAFE_NO_PAD.encode(
            serde_json::json!({
                "wId": "ws-123",
                "cId": "conv-456",
                "uId": "user-789",
                "sbId": "sb-abc",
                "exp": 9999999999u64
            })
            .to_string()
            .as_bytes(),
        );
        let token = format!("{header}.{payload}.fakesig");

        let claims = decode_jwt_claims(&token).expect("should decode valid token");
        assert_eq!(claims.w_id, "ws-123");
        assert_eq!(claims.c_id, "conv-456");
        assert_eq!(claims.u_id, "user-789");
        assert_eq!(claims.sb_id, "sb-abc");
        assert_eq!(claims.exp, Some(9999999999));
    }

    #[test]
    fn decode_invalid_token() {
        assert!(decode_jwt_claims("not-a-jwt").is_err());
    }
}
