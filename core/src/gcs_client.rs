use anyhow::{Context, Result};
use async_trait::async_trait;
use cloud_storage::{Client, TokenCache};
use gcp_auth::TokenProvider;
use std::sync::Arc;
use tokio::sync::{Mutex, OnceCell, RwLock};

const GCS_SCOPE: &str = "https://www.googleapis.com/auth/devstorage.full_control";
// Keep this aligned with gcp_auth::Token::has_expired().
const TOKEN_EXPIRY_SKEW_SECONDS: u64 = 20;
// These are the four credential sources supported by cloud-storage::Client::new().
// Keep their authentication behavior unchanged in existing deployments.
const LEGACY_SERVICE_ACCOUNT_ENV_VARIABLES: [&str; 4] = [
    "SERVICE_ACCOUNT",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "SERVICE_ACCOUNT_JSON",
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
];

static GCS_CLIENT: OnceCell<Client> = OnceCell::const_new();

#[derive(Debug, PartialEq)]
enum GcsAuthenticationMode {
    LegacyServiceAccount,
    ApplicationDefaultCredentials,
}

/// Returns the shared GCS client used by core.
///
/// Existing regions keep using cloud-storage's service-account authentication.
/// When no legacy Dust credential is configured, the client uses ADC, including
/// the GKE metadata server exposed by Workload Identity Federation.
pub async fn gcs_client() -> Result<&'static Client> {
    GCS_CLIENT
        .get_or_try_init(|| async { build_gcs_client().await })
        .await
}

async fn build_gcs_client() -> Result<Client> {
    match authentication_mode_from_environment() {
        GcsAuthenticationMode::LegacyServiceAccount => Ok(Client::new()),
        GcsAuthenticationMode::ApplicationDefaultCredentials => {
            let provider = gcp_auth::provider()
                .await
                .context("failed to initialize GCP application default credentials for GCS")?;
            Ok(Client::with_cache(GcpAuthTokenCache::new(provider)))
        }
    }
}

fn authentication_mode_from_environment() -> GcsAuthenticationMode {
    select_authentication_mode(|name| std::env::var(name).ok())
}

fn select_authentication_mode(
    mut read_environment_variable: impl FnMut(&str) -> Option<String>,
) -> GcsAuthenticationMode {
    let has_legacy_credentials = LEGACY_SERVICE_ACCOUNT_ENV_VARIABLES.iter().any(|name| {
        read_environment_variable(name)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    });

    if has_legacy_credentials {
        GcsAuthenticationMode::LegacyServiceAccount
    } else {
        GcsAuthenticationMode::ApplicationDefaultCredentials
    }
}

struct GcpAuthTokenCache {
    provider: Arc<dyn TokenProvider>,
    cached: RwLock<Option<(String, u64)>>,
    refresh: Mutex<()>,
}

impl GcpAuthTokenCache {
    fn new(provider: Arc<dyn TokenProvider>) -> Self {
        Self {
            provider,
            cached: RwLock::new(None),
            refresh: Mutex::new(()),
        }
    }

    async fn valid_cached_token(&self) -> Option<String> {
        self.cached
            .read()
            .await
            .as_ref()
            .filter(|(_, expires_at_seconds)| {
                now_unix_seconds().saturating_add(TOKEN_EXPIRY_SKEW_SECONDS) < *expires_at_seconds
            })
            .map(|(token, _)| token.clone())
    }
}

#[async_trait]
impl TokenCache for GcpAuthTokenCache {
    async fn token_and_exp(&self) -> Option<(String, u64)> {
        self.cached.read().await.clone()
    }

    async fn set_token(&self, token: String, expires_at_seconds: u64) -> cloud_storage::Result<()> {
        *self.cached.write().await = Some((token, expires_at_seconds));
        Ok(())
    }

    async fn scope(&self) -> String {
        GCS_SCOPE.to_string()
    }

    async fn get(&self, client: &reqwest011::Client) -> cloud_storage::Result<String> {
        if let Some(token) = self.valid_cached_token().await {
            return Ok(token);
        }

        let _refresh_guard = self.refresh.lock().await;

        // Another request may have refreshed the token while this one waited.
        if let Some(token) = self.valid_cached_token().await {
            return Ok(token);
        }

        let (token, expires_at_seconds) = self.fetch_token(client).await?;
        self.set_token(token.clone(), expires_at_seconds).await?;
        Ok(token)
    }

    async fn fetch_token(
        &self,
        _client: &reqwest011::Client,
    ) -> cloud_storage::Result<(String, u64)> {
        let token = self
            .provider
            .token(&[GCS_SCOPE])
            .await
            .map_err(|error| cloud_storage::Error::Other(error.to_string()))?;
        let expires_at_seconds =
            u64::try_from(token.expires_at().timestamp()).map_err(|error| {
                cloud_storage::Error::Other(format!("invalid GCP token expiry: {error}"))
            })?;

        Ok((token.as_str().to_string(), expires_at_seconds))
    }
}

fn now_unix_seconds() -> u64 {
    u64::try_from(chrono::Utc::now().timestamp()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use futures::future::join_all;
    use gcp_auth::Token;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    struct CountingProvider {
        calls: AtomicUsize,
        delay: Duration,
    }

    #[async_trait]
    impl TokenProvider for CountingProvider {
        async fn token(&self, _scopes: &[&str]) -> Result<Arc<Token>, gcp_auth::Error> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(self.delay).await;
            let token = serde_json::from_value(serde_json::json!({
                "access_token": "test-access-token",
                "expires_in": 3600,
            }))
            .map_err(|error| gcp_auth::Error::Json("failed to build test token", error))?;
            Ok(Arc::new(token))
        }

        async fn project_id(&self) -> Result<Arc<str>, gcp_auth::Error> {
            Ok(Arc::from("test-project"))
        }
    }

    #[test]
    fn selects_application_default_credentials_without_legacy_configuration() {
        assert_eq!(
            select_authentication_mode(|_| None),
            GcsAuthenticationMode::ApplicationDefaultCredentials
        );
    }

    #[test]
    fn selects_legacy_authentication_for_existing_service_account_variables() {
        for configured_name in LEGACY_SERVICE_ACCOUNT_ENV_VARIABLES {
            assert_eq!(
                select_authentication_mode(|name| {
                    (name == configured_name).then(|| "configured".to_string())
                }),
                GcsAuthenticationMode::LegacyServiceAccount
            );
        }
    }

    #[test]
    fn ignores_blank_legacy_service_account_variables() {
        assert_eq!(
            select_authentication_mode(|_| Some("  ".to_string())),
            GcsAuthenticationMode::ApplicationDefaultCredentials
        );
    }

    #[tokio::test]
    async fn serializes_concurrent_token_refreshes() -> Result<()> {
        let provider = Arc::new(CountingProvider {
            calls: AtomicUsize::new(0),
            delay: Duration::from_millis(20),
        });
        let cache = GcpAuthTokenCache::new(provider.clone());
        let client = reqwest011::Client::builder().no_proxy().build()?;

        let results = join_all((0..8).map(|_| cache.get(&client))).await;
        for result in results {
            assert_eq!(result?, "test-access-token");
        }
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
        Ok(())
    }

    #[tokio::test]
    async fn reuses_a_valid_cached_token() -> Result<()> {
        let provider = Arc::new(CountingProvider {
            calls: AtomicUsize::new(0),
            delay: Duration::ZERO,
        });
        let cache = GcpAuthTokenCache::new(provider.clone());
        let client = reqwest011::Client::builder().no_proxy().build()?;

        assert_eq!(cache.get(&client).await?, "test-access-token");
        assert_eq!(cache.get(&client).await?, "test-access-token");
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
        Ok(())
    }

    #[tokio::test]
    async fn refreshes_a_token_near_expiry() -> Result<()> {
        let provider = Arc::new(CountingProvider {
            calls: AtomicUsize::new(0),
            delay: Duration::ZERO,
        });
        let cache = GcpAuthTokenCache::new(provider.clone());
        cache
            .set_token(
                "nearly-expired-token".to_string(),
                now_unix_seconds().saturating_add(TOKEN_EXPIRY_SKEW_SECONDS),
            )
            .await?;
        let client = reqwest011::Client::builder().no_proxy().build()?;

        assert_eq!(cache.get(&client).await?, "test-access-token");
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
        Ok(())
    }
}
