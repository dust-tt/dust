use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use http::StatusCode;
use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::from_str;
use std::{collections::HashMap, env};
use tracing::info;

// TODO(@fontanierh): Switch this to true once we have API keys configured.
static ENFORCE_API_KEY_REQUIRED: bool = false;

#[derive(Deserialize, Clone)]
struct ApiKeyEntry {
    client_name: String,
    api_key: String,
}

static API_KEYS: Lazy<HashMap<String, Vec<String>>> = Lazy::new(|| {
    let api_keys_json = env::var("API_KEYS").expect("API_KEYS must be set");
    let api_keys: Vec<ApiKeyEntry> = from_str(&api_keys_json).expect("Invalid API_KEYS JSON");

    let mut map = HashMap::new();
    for entry in api_keys {
        map.entry(entry.client_name)
            .or_insert_with(Vec::new)
            .push(entry.api_key);
    }
    map
});

pub async fn validate_api_key(
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if let Some(auth_header) = req.headers().get("Authorization") {
        let auth_header = auth_header.to_str().map_err(|_| StatusCode::UNAUTHORIZED)?;
        if auth_header.starts_with("Bearer ") {
            let provided_key = &auth_header[7..];
            for (client_name, keys) in API_KEYS.iter() {
                if keys.contains(&provided_key.to_string()) {
                    // Log the client name for auditing purposes.
                    info!("API key provided for client '{}'", client_name);
                    return Ok(next.run(req).await);
                }
            }
        }
    }
    if ENFORCE_API_KEY_REQUIRED {
        Err(StatusCode::UNAUTHORIZED)
    } else {
        info!("API key not provided, but API key enforcement is disabled. Allowing request.");
        Ok(next.run(req).await)
    }
}
