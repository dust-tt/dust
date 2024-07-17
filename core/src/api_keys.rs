use anyhow::{anyhow, Result};
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use axum::Extension;
use http::StatusCode;
use lazy_static::lazy_static;
use serde::Deserialize;
use std::{collections::HashMap, env, sync::Arc};
use tokio::{fs, sync::OnceCell};
use tracing::{error, info};

lazy_static! {
    static ref DISABLE_API_KEY_CHECK: bool = env::var("DISABLE_API_KEY_CHECK")
        .map(|s| s == "true")
        .unwrap_or(false);
}

type ApiKeyMap = Arc<HashMap<String, Vec<String>>>;
static API_KEYS: OnceCell<ApiKeyMap> = OnceCell::const_new();

#[derive(Deserialize, Clone)]
struct ApiKeyEntry {
    client_name: String,
    api_key: String,
}

async fn init_api_keys() -> Result<ApiKeyMap> {
    let api_keys_path =
        env::var("API_KEYS_PATH").map_err(|_| anyhow!("API_KEYS_PATH must be set"))?;

    let api_keys_json = fs::read_to_string(api_keys_path)
        .await
        .unwrap_or("[]".to_string());

    let api_keys: Vec<ApiKeyEntry> = serde_json::from_str(&api_keys_json)
        .map_err(|e| anyhow!("Failed to parse API keys JSON: {}", e))?;

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
    let api_keys = get_api_keys().await.map_err(|e| {
        error!("Failed to get API keys: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(auth_header) = req.headers().get("Authorization") {
        let auth_header = auth_header.to_str().map_err(|_| StatusCode::UNAUTHORIZED)?;
        if let Some(provided_key) = auth_header.strip_prefix("Bearer ") {
            for (client_name, keys) in api_keys.iter() {
                if keys.contains(&provided_key.to_string()) {
                    req.extensions_mut()
                        .insert(Extension(Arc::new(client_name.clone())));
                    return Ok(next.run(req).await);
                }
            }
        }
    }

    if !*DISABLE_API_KEY_CHECK {
        Err(StatusCode::UNAUTHORIZED)
    } else {
        info!("API key not validated, but not required");
        Ok(next.run(req).await)
    }
}
