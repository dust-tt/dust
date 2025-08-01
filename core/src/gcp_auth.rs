use once_cell::sync::Lazy;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tokio::time::{Duration, Instant};

static GCP_TOKEN_CACHE: Lazy<Arc<Mutex<Option<(String, Instant)>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

pub async fn get_gcp_access_token() -> Result<String, anyhow::Error> {
    // Check cache first, scope block ensures mutex lock is released immediately.
    {
        let cache = GCP_TOKEN_CACHE.lock().unwrap();
        if let Some((token, expires_at)) = cache.as_ref() {
            if Instant::now() < *expires_at {
                return Ok(token.clone());
            }
        }
    }

    // Try environment variable first (for local dev).
    if let Ok(token) = std::env::var("GOOGLE_CLOUD_ACCESS_TOKEN") {
        // Update cache - scope block ensures mutex lock is released immediately.
        {
            let mut cache = GCP_TOKEN_CACHE.lock().unwrap();
            // Environment tokens don't have expiry info, cache for 50min.
            let expires_at = Instant::now() + Duration::from_secs(50 * 60);
            *cache = Some((token.clone(), expires_at));
        }
        return Ok(token);
    }

    // Fallback to metadata server (for production).
    let client = reqwest::Client::new();
    let response = client
        .get("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token")
        .header("Metadata-Flavor", "Google")
        .send()
        .await?;

    let token_response: TokenResponse = response.json().await?;

    // Update cache - scope block ensures mutex lock is released immediately.
    {
        let mut cache = GCP_TOKEN_CACHE.lock().unwrap();
        let expires_at = Instant::now() + Duration::from_secs(token_response.expires_in - 300);
        *cache = Some((token_response.access_token.clone(), expires_at));
    }

    Ok(token_response.access_token)
}
