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

        // Skip provider setup when a static token is provided (tests).
        let auth = if get_static_access_token_from_env().is_some() {
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

    pub async fn invalidate(&self, cache_key: &str) {
        self.cache.invalidate(cache_key).await;
    }

    // Workspace policy lives at `w/{wId}/sandbox-egress-policy.json`. The
    // "w2:" cache key is load-bearing: invalidation tokens minted by older
    // front builds evict exactly this key.
    pub async fn get_workspace_policy(&self, w_id: &str) -> Result<Option<Policy>> {
        self.get_policy(
            &format!("w2:{w_id}"),
            &format!("w/{w_id}/sandbox-egress-policy.json"),
        )
        .await
    }

    // Owner policy: the stable per-owner allowlist at
    // `w/{wId}/sandboxes/{ownerId}.json`, where ownerId is a conversation sId
    // (conversation sandboxes) or a space sId (pod sandboxes). Survives
    // sandbox destroy/recreate cycles.
    pub async fn get_owner_policy(&self, w_id: &str, owner_id: &str) -> Result<Option<Policy>> {
        self.get_policy(
            &format!("o:{w_id}:{owner_id}"),
            &format!("w/{w_id}/sandboxes/{owner_id}.json"),
        )
        .await
    }

    // A domain is allowed if ANY of the workspace, owner, or pod policies
    // allows it. `pod_id` is the inherited pod layer for conversation
    // sandboxes running inside a pod — same file scheme as owner policies.
    // Every lookup fails closed: a GCS error never grants.
    pub async fn evaluate(
        &self,
        w_id: Option<&str>,
        owner_id: Option<&str>,
        pod_id: Option<&str>,
        domain: &str,
    ) -> bool {
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

        // The owner path needs both ids.
        let owner_allows = match (w_id, owner_id) {
            (Some(w_id), Some(owner_id)) => match self.get_owner_policy(w_id, owner_id).await {
                Ok(Some(policy)) => policy.allows(domain),
                Ok(None) => false,
                Err(error) => {
                    warn!(error = %error, w_id, owner_id, "owner policy lookup failed");
                    false
                }
            },
            _ => false,
        };

        if owner_allows {
            return true;
        }

        let pod_allows = match (w_id, pod_id) {
            (Some(w_id), Some(pod_id)) => match self.get_owner_policy(w_id, pod_id).await {
                Ok(Some(policy)) => policy.allows(domain),
                Ok(None) => false,
                Err(error) => {
                    warn!(error = %error, w_id, pod_id, "pod policy lookup failed");
                    false
                }
            },
            _ => false,
        };

        pod_allows
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
        if let Some(token) = get_static_access_token_from_env() {
            return Ok(token);
        }

        let auth = self.auth.as_ref().ok_or_else(|| {
            anyhow!(
                "no GCP credentials: set GOOGLE_CLOUD_ACCESS_TOKEN, set GOOGLE_APPLICATION_CREDENTIALS, or run with metadata/ADC (for example WIF)"
            )
        })?;

        let token = auth
            .token(&[GCS_SCOPE])
            .await
            .context("failed to get GCP access token")?;

        Ok(token.as_str().to_string())
    }
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
