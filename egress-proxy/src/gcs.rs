use crate::policy::Policy;
use anyhow::{anyhow, Context, Result};
use moka::future::Cache;
use moka::Expiry;
use reqwest::{Client, StatusCode};
use std::time::{Duration, Instant};
use tracing::warn;

const DEFAULT_NEGATIVE_CACHE_TTL_SECONDS: u64 = 10;
const GCS_SCOPE: &str = "https://www.googleapis.com/auth/devstorage.read_only";

#[derive(Clone)]
pub struct GcsPolicyProvider {
    client: Client,
    bucket: String,
    base_url: String,
    cache: Cache<String, CacheEntry>,
    auth: Option<std::sync::Arc<dyn gcp_auth::TokenProvider>>,
}

#[derive(Clone)]
enum CacheEntry {
    Found(Policy),
    Missing,
}

#[derive(Clone)]
struct CacheExpiry {
    positive_ttl: Duration,
    negative_ttl: Duration,
}

impl GcsPolicyProvider {
    pub async fn new(bucket: String, positive_ttl: Duration, base_url: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .context("failed to build GCS HTTP client")?;
        let cache = Cache::builder()
            .max_capacity(10_000)
            .expire_after(CacheExpiry {
                positive_ttl,
                negative_ttl: Duration::from_secs(DEFAULT_NEGATIVE_CACHE_TTL_SECONDS),
            })
            .build();

        // Skip GCP auth setup when a static token is provided (tests).
        let auth = if std::env::var("GOOGLE_CLOUD_ACCESS_TOKEN").is_ok() {
            None
        } else {
            Some(
                gcp_auth::provider()
                    .await
                    .context("failed to initialize GCP authentication")?,
            )
        };

        Ok(Self {
            client,
            bucket,
            base_url,
            cache,
            auth,
        })
    }

    pub async fn get_workspace_policy(&self, w_id: &str) -> Result<Option<Policy>> {
        self.get_policy(&format!("w:{w_id}"), &format!("workspaces/{w_id}.json"))
            .await
    }

    pub async fn get_sandbox_policy(&self, sb_id: &str) -> Result<Option<Policy>> {
        self.get_policy(&format!("s:{sb_id}"), &format!("sandboxes/{sb_id}.json"))
            .await
    }

    pub async fn evaluate(&self, w_id: Option<&str>, sb_id: &str, domain: &str) -> bool {
        let workspace_allows = match w_id {
            Some(workspace_id) => match self.get_workspace_policy(workspace_id).await {
                Ok(Some(policy)) => policy.allows(domain),
                Ok(None) => false,
                Err(error) => {
                    warn!(error = %error, w_id = workspace_id, "workspace policy lookup failed");
                    false
                }
            },
            None => false,
        };

        if workspace_allows {
            return true;
        }

        match self.get_sandbox_policy(sb_id).await {
            Ok(Some(policy)) => policy.allows(domain),
            Ok(None) => false,
            Err(error) => {
                warn!(error = %error, sb_id, "sandbox policy lookup failed");
                false
            }
        }
    }

    async fn get_policy(&self, cache_key: &str, object_name: &str) -> Result<Option<Policy>> {
        if let Some(entry) = self.cache.get(cache_key).await {
            return Ok(entry.into_policy());
        }

        let policy = self.fetch_policy(object_name).await?;
        let cache_entry = match policy {
            Some(policy) => CacheEntry::Found(policy),
            None => CacheEntry::Missing,
        };

        self.cache
            .insert(cache_key.to_string(), cache_entry.clone())
            .await;

        Ok(cache_entry.into_policy())
    }

    async fn fetch_policy(&self, object_name: &str) -> Result<Option<Policy>> {
        let access_token = self.get_access_token().await?;
        let object_name = urlencoding::encode(object_name);
        let url = format!(
            "{}/b/{}/o/{}?alt=media",
            self.base_url, self.bucket, object_name
        );

        let response = self
            .client
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await
            .context("failed to fetch GCS policy object")?;

        match response.status() {
            StatusCode::OK => {
                let bytes = response
                    .bytes()
                    .await
                    .context("failed to read GCS policy object body")?;
                let policy = serde_json::from_slice::<Policy>(&bytes)
                    .context("failed to deserialize GCS policy object")?;
                Ok(Some(policy))
            }
            StatusCode::NOT_FOUND => Ok(None),
            status => Err(anyhow!("GCS policy fetch returned status {status}")),
        }
    }

    async fn get_access_token(&self) -> Result<String> {
        // Static token bypass for tests.
        if let Ok(token) = std::env::var("GOOGLE_CLOUD_ACCESS_TOKEN") {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }

        let auth = self.auth.as_ref().ok_or_else(|| {
            anyhow!(
                "no GCP credentials: set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_ACCESS_TOKEN"
            )
        })?;

        let token = auth
            .token(&[GCS_SCOPE])
            .await
            .context("failed to get GCP access token")?;

        Ok(token.as_str().to_string())
    }
}

impl CacheEntry {
    fn into_policy(self) -> Option<Policy> {
        match self {
            Self::Found(policy) => Some(policy),
            Self::Missing => None,
        }
    }
}

impl Expiry<String, CacheEntry> for CacheExpiry {
    fn expire_after_create(
        &self,
        _key: &String,
        value: &CacheEntry,
        _created_at: Instant,
    ) -> Option<Duration> {
        Some(self.ttl_for(value))
    }

    fn expire_after_read(
        &self,
        _key: &String,
        _value: &CacheEntry,
        _read_at: Instant,
        duration_until_expiry: Option<Duration>,
        _last_modified_at: Instant,
    ) -> Option<Duration> {
        duration_until_expiry
    }

    fn expire_after_update(
        &self,
        _key: &String,
        value: &CacheEntry,
        _updated_at: Instant,
        _duration_until_expiry: Option<Duration>,
    ) -> Option<Duration> {
        Some(self.ttl_for(value))
    }
}

impl CacheExpiry {
    fn ttl_for(&self, value: &CacheEntry) -> Duration {
        match value {
            CacheEntry::Found(_) => self.positive_ttl,
            CacheEntry::Missing => self.negative_ttl,
        }
    }
}
