use jsonwebtoken::{decode, Algorithm, DecodingKey, TokenData, Validation};
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

const EXPECTED_ISSUER: &str = "dust-front";
const EXPECTED_AUDIENCE: &str = "dust-egress-proxy";

#[derive(Clone)]
pub struct JwtValidator {
    decoding_key: DecodingKey,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedToken {
    pub sb_id: Option<String>,
    pub w_id: Option<String>,
    pub action: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum JwtValidationError {
    #[error("expired jwt")]
    Expired,
    #[error("invalid jwt claims")]
    InvalidClaims,
    #[error("invalid jwt")]
    InvalidJwt,
}

#[derive(Debug, Deserialize)]
struct Claims {
    #[serde(rename = "sbId")]
    sb_id: Option<String>,
    #[serde(rename = "wId")]
    w_id: Option<String>,
    action: Option<String>,
    exp: usize,
}

impl JwtValidator {
    pub fn new(secret: &str) -> Self {
        Self {
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn validate(&self, raw_token: &str) -> Result<ValidatedToken, JwtValidationError> {
        let mut validation = Validation::new(Algorithm::HS256);
        // TODO(sandbox-egress): Nice-to-have once front token minting is wired: make the
        // front/proxy clock-skew tolerance explicit and cover it with a unit test.
        validation.validate_exp = false;
        validation.set_issuer(&[EXPECTED_ISSUER]);
        validation.set_audience(&[EXPECTED_AUDIENCE]);
        validation.required_spec_claims.insert("exp".to_string());
        validation.required_spec_claims.insert("iss".to_string());
        validation.required_spec_claims.insert("aud".to_string());

        let token =
            decode::<Claims>(raw_token, &self.decoding_key, &validation).map_err(map_jwt_error)?;

        claims_to_validated_token(token)
    }
}

fn claims_to_validated_token(
    token: TokenData<Claims>,
) -> Result<ValidatedToken, JwtValidationError> {
    let claims = token.claims;
    let now_seconds = current_unix_timestamp_seconds()?;

    if claims.exp == 0 || claims.exp <= now_seconds {
        return Err(JwtValidationError::Expired);
    }

    let sb_id = claims.sb_id.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let w_id = claims.w_id.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let action = claims.action.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    Ok(ValidatedToken {
        sb_id,
        w_id,
        action,
    })
}

fn current_unix_timestamp_seconds() -> Result<usize, JwtValidationError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| JwtValidationError::InvalidClaims)?;
    usize::try_from(duration.as_secs()).map_err(|_| JwtValidationError::InvalidClaims)
}

fn map_jwt_error(error: jsonwebtoken::errors::Error) -> JwtValidationError {
    match error.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => JwtValidationError::Expired,
        jsonwebtoken::errors::ErrorKind::InvalidIssuer
        | jsonwebtoken::errors::ErrorKind::InvalidAudience
        | jsonwebtoken::errors::ErrorKind::MissingRequiredClaim(_) => {
            JwtValidationError::InvalidClaims
        }
        _ => JwtValidationError::InvalidJwt,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        JwtValidationError, JwtValidator, ValidatedToken, EXPECTED_AUDIENCE, EXPECTED_ISSUER,
    };
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use serde::Serialize;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Debug, Serialize)]
    struct TestClaims<'a> {
        #[serde(rename = "sbId", skip_serializing_if = "Option::is_none")]
        sb_id: Option<&'a str>,
        #[serde(rename = "wId", skip_serializing_if = "Option::is_none")]
        w_id: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        action: Option<&'a str>,
        iss: &'a str,
        aud: &'a str,
        exp: usize,
    }

    #[test]
    fn validates_sandbox_token_with_all_claims() {
        let validator = JwtValidator::new("secret");
        let token = sandbox_token("secret", "sbx", Some("workspace"), 60);

        let validated = validator
            .validate(&token)
            .expect("token with valid claims should validate");

        assert_eq!(validated.sb_id.as_deref(), Some("sbx"));
        assert_eq!(validated.w_id.as_deref(), Some("workspace"));
        assert_eq!(validated.action, None);
    }

    #[test]
    fn accepts_tokens_without_sandbox_id() {
        let validator = JwtValidator::new("secret");
        let token = token_with_claims(TestClaims {
            sb_id: None,
            w_id: None,
            action: Some("invalidate-policy"),
            iss: EXPECTED_ISSUER,
            aud: EXPECTED_AUDIENCE,
            exp: future_exp(60),
        });

        let validated = validator
            .validate(&token)
            .expect("token without sbId should validate");

        assert_eq!(validated.sb_id, None);
        assert_eq!(validated.action.as_deref(), Some("invalidate-policy"));
    }

    #[test]
    fn accepts_tokens_without_workspace_id() {
        let validator = JwtValidator::new("secret");
        let token = sandbox_token("secret", "sbx", None, 60);

        let validated = validator
            .validate(&token)
            .expect("token without wId should validate");

        assert_eq!(validated.sb_id.as_deref(), Some("sbx"));
        assert_eq!(validated.w_id, None);
    }

    #[test]
    fn normalizes_empty_sandbox_id_to_none() {
        let validator = JwtValidator::new("secret");
        let token = sandbox_token("secret", "   ", None, 60);

        let validated = validator
            .validate(&token)
            .expect("empty sbId should normalize to None");

        assert_eq!(validated.sb_id, None);
    }

    #[test]
    fn normalizes_empty_workspace_id_to_none() {
        let validator = JwtValidator::new("secret");
        let token = sandbox_token("secret", "sbx", Some("   "), 60);

        let validated = validator
            .validate(&token)
            .expect("empty wId should normalize to None");

        assert_eq!(validated.sb_id.as_deref(), Some("sbx"));
        assert_eq!(validated.w_id, None);
    }

    #[test]
    fn validates_invalidation_token() {
        let validator = JwtValidator::new("secret");
        let token = token_with_claims(TestClaims {
            sb_id: None,
            w_id: Some("workspace"),
            action: Some("invalidate-policy"),
            iss: EXPECTED_ISSUER,
            aud: EXPECTED_AUDIENCE,
            exp: future_exp(60),
        });

        let validated = validator
            .validate(&token)
            .expect("invalidation token should validate");

        assert_eq!(
            validated,
            ValidatedToken {
                sb_id: None,
                w_id: Some("workspace".to_string()),
                action: Some("invalidate-policy".to_string()),
            }
        );
    }

    #[test]
    fn rejects_expired_tokens() {
        let validator = JwtValidator::new("secret");
        let token = sandbox_token("secret", "sbx", Some("workspace"), -60);

        assert_eq!(
            validator.validate(&token).unwrap_err(),
            JwtValidationError::Expired
        );
    }

    #[test]
    fn rejects_wrong_audience() {
        let validator = JwtValidator::new("secret");
        let token = token_with_claims(TestClaims {
            sb_id: Some("sbx"),
            w_id: Some("workspace"),
            action: None,
            iss: EXPECTED_ISSUER,
            aud: "wrong",
            exp: future_exp(60),
        });

        assert_eq!(
            validator.validate(&token).unwrap_err(),
            JwtValidationError::InvalidClaims
        );
    }

    fn sandbox_token(
        secret: &str,
        sb_id: &str,
        w_id: Option<&str>,
        exp_offset_seconds: i64,
    ) -> String {
        let claims = TestClaims {
            sb_id: Some(sb_id),
            w_id,
            action: None,
            iss: EXPECTED_ISSUER,
            aud: EXPECTED_AUDIENCE,
            exp: offset_exp(exp_offset_seconds),
        };

        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("test helper should encode JWT successfully")
    }

    fn token_with_claims(claims: TestClaims<'_>) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(b"secret"),
        )
        .expect("test helper should encode JWT successfully")
    }

    fn future_exp(offset_seconds: i64) -> usize {
        offset_exp(offset_seconds)
    }

    fn offset_exp(offset_seconds: i64) -> usize {
        let now_seconds = i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("current time should be after the Unix epoch")
                .as_secs(),
        )
        .expect("current Unix timestamp should fit in i64");
        let exp_seconds = now_seconds + offset_seconds;
        usize::try_from(exp_seconds).expect("expiration timestamp should fit in usize")
    }
}
