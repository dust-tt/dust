use anyhow::{Context, Result};
use async_trait::async_trait;
use cloud_storage::{Client, TokenCache};
use gcp_auth::TokenProvider;
use std::sync::Arc;
use tokio::sync::{OnceCell, RwLock};

const GCS_SCOPE: &str = "https://www.googleapis.com/auth/devstorage.full_control";

static GCS_CLIENT: OnceCell<Client> = OnceCell::const_new();

/// Shared GCS client authenticated via Application Default Credentials.
///
/// Supports:
/// - `GOOGLE_CLOUD_ACCESS_TOKEN` (tests / local overrides)
/// - `GOOGLE_APPLICATION_CREDENTIALS` service-account JSON
/// - gcloud application-default credentials
/// - GCE/GKE metadata server (including Workload Identity Federation)
pub async fn gcs_client() -> Result<&'static Client> {
    GCS_CLIENT
        .get_or_try_init(|| async { build_gcs_client().await })
        .await
}

async fn build_gcs_client() -> Result<Client> {
    if let Some(token) = get_static_access_token_from_env() {
        return Ok(Client::with_cache(StaticAccessTokenCache::new(token)));
    }

    let provider = gcp_auth::provider()
        .await
        .context("failed to initialize GCP authentication for GCS")?;

    Ok(Client::with_cache(GcpAuthTokenCache::new(provider)))
}

fn get_static_access_token_from_env() -> Option<String> {
    std::env::var("GOOGLE_CLOUD_ACCESS_TOKEN")
        .ok()
        .and_then(|token| {
            let trimmed = token.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
}

struct StaticAccessTokenCache {
    token: String,
}

impl StaticAccessTokenCache {
    fn new(token: String) -> Self {
        Self { token }
    }
}

#[async_trait]
impl TokenCache for StaticAccessTokenCache {
    async fn token_and_exp(&self) -> Option<(String, u64)> {
        // Static tokens from env have no expiry metadata; treat as long-lived.
        Some((self.token.clone(), u64::MAX / 2))
    }

    async fn set_token(&self, _token: String, _exp: u64) -> cloud_storage::Result<()> {
        Ok(())
    }

    async fn scope(&self) -> String {
        GCS_SCOPE.to_string()
    }

    async fn fetch_token(
        &self,
        _client: &reqwest011::Client,
    ) -> cloud_storage::Result<(String, u64)> {
        Ok((self.token.clone(), u64::MAX / 2))
    }
}

struct GcpAuthTokenCache {
    provider: Arc<dyn TokenProvider>,
    cached: RwLock<Option<(String, u64)>>,
}

impl GcpAuthTokenCache {
    fn new(provider: Arc<dyn TokenProvider>) -> Self {
        Self {
            provider,
            cached: RwLock::new(None),
        }
    }
}

#[async_trait]
impl TokenCache for GcpAuthTokenCache {
    async fn token_and_exp(&self) -> Option<(String, u64)> {
        self.cached.read().await.clone()
    }

    async fn set_token(&self, token: String, exp: u64) -> cloud_storage::Result<()> {
        *self.cached.write().await = Some((token, exp));
        Ok(())
    }

    async fn scope(&self) -> String {
        GCS_SCOPE.to_string()
    }

    async fn fetch_token(
        &self,
        _client: &reqwest011::Client,
    ) -> cloud_storage::Result<(String, u64)> {
        let token = self
            .provider
            .token(&[GCS_SCOPE])
            .await
            .map_err(|e| cloud_storage::Error::Other(e.to_string()))?;

        let expires_at = token.expires_at().timestamp();
        let exp = if expires_at > 0 {
            expires_at as u64
        } else {
            // Fallback if the provider does not expose a usable expiry.
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() + 3600)
                .unwrap_or(3600)
        };

        Ok((token.as_str().to_string(), exp))
    }
}
