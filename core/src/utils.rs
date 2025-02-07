use anyhow::Result;
use async_std::path::PathBuf;
use axum::{Extension, Json};
use hyper::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqids::Sqids;
use std::{io::Write, sync::Arc};
use tower_http::trace::MakeSpan;
use tracing::error;
use uuid::Uuid;

#[derive(Debug)]
pub struct ParseError(&'static str);

impl ParseError {
    pub fn with_message(message: &'static str) -> Self {
        Self(message)
    }

    pub fn new() -> Self {
        Self::with_message("parse failed.")
    }
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ParseError {
    fn description(&self) -> &str {
        self.0
    }
}

pub async fn init_check() -> Result<PathBuf> {
    let current_dir = tokio::task::spawn_blocking(|| match std::env::var("DUST_DIR") {
        Ok(dust_dir) => PathBuf::from(shellexpand::tilde(&dust_dir).into_owned()),
        Err(_) => PathBuf::from(std::env::current_dir().unwrap()),
    })
    .await?;

    let index_path = current_dir.join("index.dust");
    if !index_path.exists().await {
        Err(anyhow::anyhow!(
            "Not a Dust directory (index.dust not found in {})",
            current_dir.display()
        ))?
    }

    let store_path = current_dir.join("store.sqlite");
    if !store_path.exists().await {
        Err(anyhow::anyhow!(
            "Not a Dust directory (store.sqlite not found in {})",
            current_dir.display()
        ))?
    }

    Ok(current_dir)
}

pub fn new_id() -> String {
    let s = Uuid::new_v4();
    let mut hasher = blake3::Hasher::new();
    hasher.update(s.as_bytes());
    format!("{}", hasher.finalize().to_hex())
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as u64
}

pub fn info(msg: &str) {
    println!("{} {}", "[i]", msg);
}

pub fn action(msg: &str) {
    println!("{} {}", "[·]", msg);
}

pub fn error(msg: &str) {
    println!("{} {}", "[!]", msg);
}

pub fn done(msg: &str) {
    println!("{} {}", "[✓]", msg);
}

pub fn confirm(msg: &str) -> Result<bool> {
    print!("{} {} Confirm ([y]/n) ? ", "[?]", msg);
    std::io::stdout().flush()?;

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    if input.trim().len() > 0 && input.trim() != "y" {
        Ok(false)
    } else {
        Ok(true)
    }
}

#[derive(Serialize, Deserialize)]
pub struct APIError {
    pub code: String,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct APIResponse {
    pub error: Option<APIError>,
    pub response: Option<Value>,
}

pub fn error_response(
    status: StatusCode,
    code: &str,
    message: &str,
    e: Option<anyhow::Error>,
) -> (StatusCode, Json<APIResponse>) {
    error!(
        error_code = code,
        error_message = message,
        error = ?e,
        "API error"
    );
    (
        status,
        Json(APIResponse {
            error: Some(APIError {
                code: code.to_string(),
                message: match e {
                    Some(err) => format!("{} (error: {:?})", message, err),
                    None => message.to_string(),
                },
            }),
            response: None,
        }),
    )
}

/// Core requests span creation.
#[derive(Debug, Clone)]
pub struct CoreRequestMakeSpan {}

impl CoreRequestMakeSpan {
    pub fn new() -> Self {
        Self {}
    }
}

impl Default for CoreRequestMakeSpan {
    fn default() -> Self {
        Self::new()
    }
}

impl<B> MakeSpan<B> for CoreRequestMakeSpan {
    fn make_span(&mut self, request: &http::Request<B>) -> tracing::Span {
        tracing::span!(
            tracing::Level::INFO,
            "core request",
            method = %request.method(),
            uri = %request.uri(),
            request_span_id = new_id()[0..12].to_string(),
            dust_client_name = request.extensions()
            .get::<Extension<Arc<String>>>()
            .map(|ext| ext.as_ref().as_str())
            .unwrap_or("unknown")
        )
    }
}

// sqids

// Minimum length requirement for resource string IDs to ensure sufficient encoding space.
// This value is synchronized with the frontend implementation.
const RESOURCE_S_ID_MIN_LENGTH: u8 = 10;

// WARNING: These legacy bits are part of the ID encoding scheme and must be preserved to maintain
// backwards compatibility with existing string IDs stored in the database.
// They were originally used for sharding and region information but are no longer functionally
// needed after migration to cross-region architecture.
const LEGACY_SHARD_BIT: u64 = 1;
const LEGACY_REGION_BIT: u64 = 1; // Previously indicated US region.

pub fn make_id(prefix: &str, id: u64) -> Result<String> {
    let sqids = Sqids::builder()
        .min_length(RESOURCE_S_ID_MIN_LENGTH)
        .build()?;
    let id = sqids.encode(&[LEGACY_REGION_BIT, LEGACY_SHARD_BIT, id])?;
    Ok(format!("{}_{}", prefix, id))
}

pub fn parse_id(id: &str) -> Result<(String, u64)> {
    let sqids = Sqids::builder()
        .min_length(RESOURCE_S_ID_MIN_LENGTH)
        .build()?;
    let parts = id.split('_').collect::<Vec<&str>>();
    if parts.len() != 2 {
        return Err(anyhow::anyhow!("Invalid id format: {}", id));
    }

    let prefix = parts[0];
    let decoded = sqids.decode(parts[1]);

    if decoded.len() != 3 {
        return Err(anyhow::anyhow!("Invalid id decoding failed: {}", id));
    }

    Ok((prefix.to_string(), decoded[2]))
}
