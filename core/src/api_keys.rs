use anyhow::{anyhow, Result};
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use axum::Extension;
use http::StatusCode;
use lazy_static::lazy_static;
use ring::constant_time::verify_slices_are_equal;
use serde::Deserialize;
use std::{collections::HashMap, env, sync::Arc};
use tokio::{fs, sync::OnceCell};
use tracing::{error, warn};

lazy_static! {
    static ref DISABLE_API_KEY_CHECK: bool = env::var("DISABLE_API_KEY_CHECK")
        .map(|s| s == "true")
        .unwrap_or(false);
}

type ApiKeyMap = Arc<HashMap<String, Vec<String>>>;
static API_KEYS: OnceCell<ApiKeyMap> = OnceCell::const_new();

fn api_keys_are_equal(provided_key: &str, expected_key: &str) -> bool {
    provided_key.len() == expected_key.len()
        && verify_slices_are_equal(provided_key.as_bytes(), expected_key.as_bytes()).is_ok()
}

#[derive(Deserialize, Clone)]
struct ApiKeyEntry {
    client_name: String,
    api_key: String,
}

async fn init_api_keys() -> Result<ApiKeyMap> {
    let api_keys_json = match env::var("API_KEYS") {
        Ok(path) => fs::read_to_string(path).await.unwrap_or("[]".to_string()),
        Err(_) => "[]".to_string(),
    };

    let api_keys: Vec<ApiKeyEntry> = match serde_json::from_str(&api_keys_json) {
        Ok(keys) => keys,
        Err(e) => {
            warn!("Failed to parse API keys: {}", e);
            return Err(anyhow!("Failed to parse API keys"));
        }
    };

    let mut map = HashMap::new();
    for entry in api_keys {
        map.entry(entry.client_name)
            .or_insert_with(Vec::new)
            .push(entry.api_key);
    }
    Ok(Arc::new(map))
}

async fn get_api_keys() -> Result<ApiKeyMap> {
    match API_KEYS.get() {
        Some(keys) => Ok(keys.clone()),
        None => {
            let keys = init_api_keys().await?;
            API_KEYS.set(keys.clone())?;
            Ok(keys)
        }
    }
}

pub async fn validate_api_key(
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if *DISABLE_API_KEY_CHECK {
        return Ok(next.run(req).await);
    }

    let api_keys = get_api_keys().await.map_err(|e| {
        error!("Failed to get API keys: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(auth_header) = req.headers().get("Authorization") {
        let auth_header = auth_header.to_str().map_err(|_| StatusCode::UNAUTHORIZED)?;
        if let Some(provided_key) = auth_header.strip_prefix("Bearer ") {
            let mut matched_client_name = None;

            for (client_name, keys) in api_keys.iter() {
                for expected_key in keys {
                    if api_keys_are_equal(provided_key, expected_key) {
                        matched_client_name = Some(client_name.clone());
                    }
                }
            }

            if let Some(client_name) = matched_client_name {
                req.extensions_mut()
                    .insert(Extension(Arc::new(client_name)));
                return Ok(next.run(req).await);
            }
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}
