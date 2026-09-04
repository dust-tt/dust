use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use cloud_storage::{Client, TokenCache};
use gcp_auth::{CustomServiceAccount, TokenProvider};
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{Mutex, OnceCell, RwLock};

const GCS_SCOPE: &str = "https://www.googleapis.com/auth/devstorage.full_control";
const TOKEN_EXPIRY_SKEW_SECONDS: u64 = 300;

static GCS_CLIENT: OnceCell<Client> = OnceCell::const_new();

/// Shared GCS client authenticated for Dust's production and local setups.
///
/// Supports, in order:
/// - `GOOGLE_CLOUD_ACCESS_TOKEN` (tests / local overrides)
/// - `SERVICE_ACCOUNT` path to a service-account JSON file (Dust's existing env)
/// - `SERVICE_ACCOUNT_JSON` inline service-account JSON
/// - `gcp_auth::provider()` fallback (GOOGLE_APPLICATION_CREDENTIALS, gcloud ADC,
///   GCE/GKE metadata / Workload Identity Federation)
pub async fn gcs_client() -> Result<&'static Client> {
    GCS_CLIENT
        .get_or_try_init(|| async { build_gcs_client().await })
        .await
}

async fn build_gcs_client() -> Result<Client> {
    if let Some(token) = get_static_access_token_from_env() {
        return Ok(Client::with_cache(StaticAccessTokenCache::new(token)));
    }

    let provider = resolve_token_provider()
        .await
        .context("failed to initialize GCP authentication for GCS")?;

    Ok(Client::with_cache(GcpAuthTokenCache::new(provider)))
}

async fn resolve_token_provider() -> Result<Arc<dyn TokenProvider>> {
    if let Some(provider) = service_account_provider_from_env()? {
        return Ok(provider);
    }

    gcp_auth::provider()
        .await
        .map_err(|e| anyhow!("failed to initialize GCP ADC/WIF provider: {e}"))
}

fn service_account_provider_from_env() -> Result<Option<Arc<dyn TokenProvider>>> {
    if let Ok(path) = std::env::var("SERVICE_ACCOUNT") {
        let path = path.trim();
        if !path.is_empty() {
            let account = CustomServiceAccount::from_file(Path::new(path)).map_err(|e| {
                anyhow!("failed to load SERVICE_ACCOUNT credentials from {path}: {e}")
            })?;
            return Ok(Some(Arc::new(account)));
        }
    }

    if let Ok(json) = std::env::var("SERVICE_ACCOUNT_JSON") {
        let json = json.trim();
        if !json.is_empty() {
            let account = CustomServiceAccount::from_json(json)
                .map_err(|e| anyhow!("failed to parse SERVICE_ACCOUNT_JSON credentials: {e}"))?;
            return Ok(Some(Arc::new(account)));
        }
    }

    Ok(None)
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

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
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
    /// Serializes refreshes so concurrent callers share one token fetch.
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

    async fn get(&self, client: &reqwest011::Client) -> cloud_storage::Result<String> {
        if let Some((token, exp)) = self.token_and_exp().await {
            if now_unix_seconds() + TOKEN_EXPIRY_SKEW_SECONDS < exp {
                return Ok(token);
            }
        }

        let _guard = self.refresh.lock().await;

        // Another waiter may have refreshed while we were queued.
        if let Some((token, exp)) = self.token_and_exp().await {
            if now_unix_seconds() + TOKEN_EXPIRY_SKEW_SECONDS < exp {
                return Ok(token);
            }
        }

        let (token, exp) = self.fetch_token(client).await?;
        self.set_token(token.clone(), exp).await?;
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
            .map_err(|e| cloud_storage::Error::Other(e.to_string()))?;

        let expires_at = token.expires_at().timestamp();
        let exp = if expires_at > 0 {
            expires_at as u64
        } else {
            now_unix_seconds() + 3600
        };

        Ok((token.as_str().to_string(), exp))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gcp_auth::Token;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;
    use tempfile::NamedTempFile;

    static ENV_LOCK: Mutex<()> = Mutex::const_new(());

    fn test_service_account_json() -> String {
        let rsa = openssl::rsa::Rsa::generate(2048).expect("rsa key");
        let pkey = openssl::pkey::PKey::from_rsa(rsa).expect("pkey");
        let private_key =
            String::from_utf8(pkey.private_key_to_pem_pkcs8().expect("pkcs8 pem")).expect("utf8");
        serde_json::json!({
            "type": "service_account",
            "project_id": "test-project",
            "private_key_id": "test-key-id",
            "private_key": private_key,
            "client_email": "test@test-project.iam.gserviceaccount.com",
            "client_id": "1234567890",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/test"
        })
        .to_string()
    }

    fn test_token(expires_in_seconds: u64) -> Arc<Token> {
        Arc::new(
            serde_json::from_value(serde_json::json!({
                "access_token": "test-access-token",
                "expires_in": expires_in_seconds,
            }))
            .expect("token json"),
        )
    }

    struct CountingProvider {
        calls: AtomicUsize,
        delay: Duration,
    }

    #[async_trait]
    impl TokenProvider for CountingProvider {
        async fn token(&self, _scopes: &[&str]) -> Result<Arc<Token>, gcp_auth::Error> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(self.delay).await;
            Ok(test_token(3600))
        }

        async fn project_id(&self) -> Result<Arc<str>, gcp_auth::Error> {
            Ok(Arc::from("test-project"))
        }
    }

    #[tokio::test]
    async fn service_account_env_loads_custom_provider() {
        let _env_guard = ENV_LOCK.lock().await;
        let json = test_service_account_json();
        let mut file = NamedTempFile::new().expect("tempfile");
        file.write_all(json.as_bytes()).expect("write sa");

        let _sa = EnvGuard::set("SERVICE_ACCOUNT", file.path().to_str().unwrap());
        let _saj = EnvGuard::remove("SERVICE_ACCOUNT_JSON");

        let provider = service_account_provider_from_env()
            .expect("resolve SERVICE_ACCOUNT")
            .expect("provider should be present");

        let project_id = provider.project_id().await.expect("project id");
        assert_eq!(project_id.as_ref(), "test-project");
    }

    #[tokio::test]
    async fn service_account_json_env_loads_custom_provider() {
        let _env_guard = ENV_LOCK.lock().await;
        let json = test_service_account_json();
        let _saj = EnvGuard::set("SERVICE_ACCOUNT_JSON", &json);
        let _sa = EnvGuard::remove("SERVICE_ACCOUNT");

        let provider = service_account_provider_from_env()
            .expect("resolve SERVICE_ACCOUNT_JSON")
            .expect("provider should be present");

        let project_id = provider.project_id().await.expect("project id");
        assert_eq!(project_id.as_ref(), "test-project");
    }

    #[tokio::test]
    async fn token_cache_single_flights_refresh() {
        let provider = Arc::new(CountingProvider {
            calls: AtomicUsize::new(0),
            delay: Duration::from_millis(50),
        });
        let cache = Arc::new(GcpAuthTokenCache::new(provider.clone()));
        let http = reqwest011::Client::new();

        let mut handles = Vec::new();
        for _ in 0..8 {
            let cache = cache.clone();
            let http = http.clone();
            handles.push(tokio::spawn(async move {
                cache.get(&http).await.expect("token")
            }));
        }

        let tokens: Vec<String> = futures::future::try_join_all(handles)
            .await
            .expect("join")
            .into_iter()
            .collect();

        assert!(tokens.iter().all(|t| t == "test-access-token"));
        assert_eq!(
            provider.calls.load(Ordering::SeqCst),
            1,
            "concurrent get() calls should share a single refresh"
        );
    }

    #[tokio::test]
    async fn token_cache_reuses_cached_token_without_refresh() {
        let provider = Arc::new(CountingProvider {
            calls: AtomicUsize::new(0),
            delay: Duration::from_millis(0),
        });
        let cache = GcpAuthTokenCache::new(provider.clone());
        let http = reqwest011::Client::new();

        let first = cache.get(&http).await.expect("first token");
        let second = cache.get(&http).await.expect("second token");

        assert_eq!(first, second);
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn static_access_token_ignores_blank_values() {
        let _env_guard = ENV_LOCK.lock().await;
        let _guard = EnvGuard::set("GOOGLE_CLOUD_ACCESS_TOKEN", "   ");
        assert!(get_static_access_token_from_env().is_none());
    }

    /// RAII env var guard so tests don't leak credentials into other tests.
    struct EnvGuard {
        key: &'static str,
        previous: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let previous = std::env::var(key).ok();
            std::env::set_var(key, value);
            Self { key, previous }
        }

        fn remove(key: &'static str) -> Self {
            let previous = std::env::var(key).ok();
            std::env::remove_var(key);
            Self { key, previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.previous {
                Some(value) => std::env::set_var(self.key, value),
                None => std::env::remove_var(self.key),
            }
        }
    }
}
