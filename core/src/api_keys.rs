use anyhow::{anyhow, Result};
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use http::StatusCode;
use serde::Deserialize;
use std::{collections::HashMap, env, sync::Arc};
use tokio::{fs, sync::OnceCell};
use tracing::{error, info};

// TODO(@fontanierh): Switch this to true once we have API keys configured.
static ENFORCE_API_KEY_REQUIRED: bool = false;

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
        .map_err(|e| anyhow!("Failed to read API keys file: {}", e))?;
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
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let api_keys = get_api_keys().await.map_err(|e| {
        error!("Failed to get API keys: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(auth_header) = req.headers().get("Authorization") {
        let auth_header = auth_header.to_str().map_err(|_| StatusCode::UNAUTHORIZED)?;
        if auth_header.starts_with("Bearer ") {
            let provided_key = &auth_header[7..];
            for (client_name, keys) in api_keys.iter() {
                if keys.contains(&provided_key.to_string()) {
                    info!("API key validated for client '{}'", client_name);
                    return Ok(next.run(req).await);
                }
            }
        }
    }

    if ENFORCE_API_KEY_REQUIRED {
        Err(StatusCode::UNAUTHORIZED)
    } else {
        info!("API key not validated, but not required");
        Ok(next.run(req).await)
    }
}
