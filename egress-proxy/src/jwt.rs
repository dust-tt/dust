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
pub struct ValidatedSandboxToken {
    pub sb_id: String,
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
    sb_id: String,
    iss: String,
    aud: String,
    exp: usize,
}

impl JwtValidator {
    pub fn new(secret: &str) -> Self {
        Self {
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn validate(&self, raw_token: &str) -> Result<ValidatedSandboxToken, JwtValidationError> {
        // TODO(sandbox-egress): Front will mint these JWTs during sandbox setup and write the
        // per-sandbox policy before user code can execute.
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
) -> Result<ValidatedSandboxToken, JwtValidationError> {
    let claims = token.claims;
    let now_seconds = current_unix_timestamp_seconds()?;
    if claims.sb_id.trim().is_empty()
        || claims.iss != EXPECTED_ISSUER
        || claims.aud != EXPECTED_AUDIENCE
        || claims.exp == 0
    {
        return Err(JwtValidationError::InvalidClaims);
    }

    if claims.exp <= now_seconds {
        return Err(JwtValidationError::Expired);
    }

    Ok(ValidatedSandboxToken {
        sb_id: claims.sb_id,
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
    use super::{JwtValidationError, JwtValidator, EXPECTED_AUDIENCE, EXPECTED_ISSUER};
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use serde::Serialize;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Debug, Serialize)]
    struct TestClaims<'a> {
        #[serde(rename = "sbId")]
        sb_id: &'a str,
        iss: &'a str,
        aud: &'a str,
        exp: usize,
    }

    #[test]
    fn validates_expected_claims() {
        let validator = JwtValidator::new("secret");
        let token = token("secret", "sbx", EXPECTED_ISSUER, EXPECTED_AUDIENCE, 60);

        let validated = validator.validate(&token).unwrap();

        assert_eq!(validated.sb_id, "sbx");
    }

    #[test]
    fn rejects_expired_tokens() {
        let validator = JwtValidator::new("secret");
        let token = token("secret", "sbx", EXPECTED_ISSUER, EXPECTED_AUDIENCE, -60);

        assert_eq!(
            validator.validate(&token).unwrap_err(),
            JwtValidationError::Expired
        );
    }

    #[test]
    fn rejects_wrong_audience() {
        let validator = JwtValidator::new("secret");
        let token = token("secret", "sbx", EXPECTED_ISSUER, "wrong", 60);

        assert_eq!(
            validator.validate(&token).unwrap_err(),
            JwtValidationError::InvalidClaims
        );
    }

    fn token(secret: &str, sb_id: &str, iss: &str, aud: &str, exp_offset_seconds: i64) -> String {
        let now_seconds = i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        )
        .unwrap();
        let exp_seconds = now_seconds + exp_offset_seconds;
        let exp = usize::try_from(exp_seconds).unwrap();
        let claims = TestClaims {
            sb_id,
            iss,
            aud,
            exp,
        };

        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }
}
