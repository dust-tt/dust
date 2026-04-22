use crate::policy::Policy;
use anyhow::{anyhow, Context, Result};
use moka::future::Cache;
use moka::Expiry;
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::warn;

const DEFAULT_NEGATIVE_CACHE_TTL_SECONDS: u64 = 10;
const GCP_METADATA_TOKEN_URL: &str =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

#[derive(Clone)]
pub struct GcsPolicyProvider {
    client: Client,
    bucket: String,
    base_url: String,
    cache: Cache<String, CacheEntry>,
    access_token_cache: Arc<Mutex<Option<(String, Instant)>>>,
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

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

impl GcsPolicyProvider {
    pub fn new(bucket: String, positive_ttl: Duration, base_url: String) -> Result<Self> {
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

        Ok(Self {
            client,
            bucket,
            base_url,
            cache,
            access_token_cache: Arc::new(Mutex::new(None)),
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

    #[allow(dead_code)]
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
        if let Ok(token) = std::env::var("GOOGLE_CLOUD_ACCESS_TOKEN") {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }

        {
            let cache = self.access_token_cache.lock().await;
            if let Some((token, expires_at)) = cache.as_ref() {
                if Instant::now() < *expires_at {
                    return Ok(token.clone());
                }
            }
        }

        let response = self
            .client
            .get(GCP_METADATA_TOKEN_URL)
            .header("Metadata-Flavor", "Google")
            .send()
            .await
            .context("failed to fetch GCP access token from metadata server")?
            .error_for_status()
            .context("metadata server returned an error for access token request")?;
        let token_response = response
            .json::<TokenResponse>()
            .await
            .context("failed to parse GCP access token response")?;

        let expires_at =
            Instant::now() + Duration::from_secs(token_response.expires_in.saturating_sub(300));
        let token = token_response.access_token;

        let mut cache = self.access_token_cache.lock().await;
        *cache = Some((token.clone(), expires_at));

        Ok(token)
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
