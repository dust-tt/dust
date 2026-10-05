use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use gcp_bigquery_client::auth::Authenticator;
use gcp_bigquery_client::error::BQError;
use gcp_bigquery_client::yup_oauth2::ServiceAccountKey;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::gcp_auth::is_google_oauth_token_uri;

const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/// Pins a service-account `token_uri` to a Google canonical endpoint.
///
/// Routing token exchange through Dust's static IP proxy must not allow
/// credential-controlled requests to arbitrary URLs.
pub fn pin_google_oauth_token_uri(token_uri: &str) -> Result<&str, BQError> {
    if is_google_oauth_token_uri(token_uri) {
        Ok(token_uri)
    } else {
        Err(BQError::InvalidServiceAccountAuthenticator(
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "Invalid BigQuery credentials: token_uri must be a Google OAuth token endpoint (got {:?})",
                    token_uri
                ),
            ),
        ))
    }
}

#[derive(Serialize)]
struct ServiceAccountClaims<'a> {
    iss: &'a str,
    aud: &'a str,
    scope: &'a str,
    iat: i64,
    exp: i64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct CachedToken {
    access_token: String,
    expires_at: Instant,
}

/// Service-account authenticator that mints tokens via a caller-provided
/// `reqwest::Client` (optionally proxied) and only accepts Google's canonical
/// `token_uri` values.
#[derive(Clone)]
pub struct ProxiedServiceAccountAuthenticator {
    sa_key: ServiceAccountKey,
    scope: String,
    http: reqwest::Client,
    cache: Arc<Mutex<Option<CachedToken>>>,
}

impl ProxiedServiceAccountAuthenticator {
    pub fn new(
        mut sa_key: ServiceAccountKey,
        scope: &str,
        http: reqwest::Client,
    ) -> Result<Arc<dyn Authenticator>, BQError> {
        let pinned = pin_google_oauth_token_uri(&sa_key.token_uri)?;
        sa_key.token_uri = pinned.to_string();

        Ok(Arc::new(Self {
            sa_key,
            scope: scope.to_string(),
            http,
            cache: Arc::new(Mutex::new(None)),
        }))
    }

    async fn mint_access_token(&self) -> Result<String, BQError> {
        {
            let cache = self.cache.lock().await;
            if let Some(cached) = cache.as_ref() {
                if Instant::now() < cached.expires_at {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        let now = chrono::Utc::now().timestamp();
        let claims = ServiceAccountClaims {
            iss: &self.sa_key.client_email,
            aud: &self.sa_key.token_uri,
            scope: &self.scope,
            iat: now,
            exp: now + 3600,
        };

        let key = EncodingKey::from_rsa_pem(self.sa_key.private_key.as_bytes()).map_err(|e| {
            BQError::InvalidServiceAccountAuthenticator(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Invalid BigQuery service account private key: {e}"),
            ))
        })?;

        let assertion = encode(
            &Header {
                alg: Algorithm::RS256,
                ..Default::default()
            },
            &claims,
            &key,
        )
        .map_err(|e| {
            BQError::InvalidServiceAccountAuthenticator(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Failed to sign BigQuery service account JWT: {e}"),
            ))
        })?;

        // token_uri was pinned in `new`; never POST to a credential-controlled URL.
        let response = self
            .http
            .post(&self.sa_key.token_uri)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&[
                ("grant_type", GRANT_TYPE),
                ("assertion", assertion.as_str()),
            ])
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(BQError::InvalidServiceAccountAuthenticator(
                std::io::Error::other(format!("Google token endpoint returned {status}: {body}")),
            ));
        }

        let token_response: TokenResponse = response.json().await?;
        let refresh_skew = Duration::from_secs(300);
        let ttl = Duration::from_secs(token_response.expires_in).saturating_sub(refresh_skew);
        let expires_at = Instant::now() + ttl;

        {
            let mut cache = self.cache.lock().await;
            *cache = Some(CachedToken {
                access_token: token_response.access_token.clone(),
                expires_at,
            });
        }

        Ok(token_response.access_token)
    }
}

#[async_trait]
impl Authenticator for ProxiedServiceAccountAuthenticator {
    async fn access_token(&self) -> Result<String, BQError> {
        self.mint_access_token().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gcp_auth::is_google_oauth_token_uri;

    #[test]
    fn accepts_canonical_google_token_uris() {
        assert!(is_google_oauth_token_uri(
            "https://oauth2.googleapis.com/token"
        ));
        assert!(is_google_oauth_token_uri(
            "https://www.googleapis.com/oauth2/v4/token"
        ));
        assert!(pin_google_oauth_token_uri("https://oauth2.googleapis.com/token").is_ok());
    }

    #[test]
    fn rejects_non_google_token_uri() {
        let err = pin_google_oauth_token_uri("https://evil.example/token").unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("token_uri must be a Google OAuth token endpoint"),
            "unexpected error: {msg}"
        );
        assert!(!is_google_oauth_token_uri(
            "https://oauth2.googleapis.com/token/../evil"
        ));
        assert!(!is_google_oauth_token_uri(
            "https://oauth2.googleapis.com.evil.example/token"
        ));
    }

    #[tokio::test]
    async fn constructor_rejects_arbitrary_token_uri_before_http() {
        let sa_key = ServiceAccountKey {
            key_type: Some("service_account".to_string()),
            project_id: Some("proj".to_string()),
            private_key_id: Some("id".to_string()),
            // Minimal PEM rejected later only if pin succeeds; pin must fail first.
            private_key: "not-a-key".to_string(),
            client_email: "sa@proj.iam.gserviceaccount.com".to_string(),
            client_id: Some("123".to_string()),
            auth_uri: Some("https://accounts.google.com/o/oauth2/auth".to_string()),
            token_uri: "https://attacker.example/token".to_string(),
            auth_provider_x509_cert_url: None,
            client_x509_cert_url: None,
        };

        let result = ProxiedServiceAccountAuthenticator::new(
            sa_key,
            "https://www.googleapis.com/auth/bigquery",
            reqwest::Client::new(),
        );

        assert!(result.is_err());
        let msg = result.err().unwrap().to_string();
        assert!(
            msg.contains("token_uri must be a Google OAuth token endpoint"),
            "unexpected error: {msg}"
        );
    }
}
