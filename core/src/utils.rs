use anyhow::Result;
use async_std::path::PathBuf;
use axum::Json;
use hyper::StatusCode;
use serde::Serialize;
use serde_json::Value;
use sqids::Sqids;
use std::io::Write;
use tower_http::trace::MakeSpan;
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

#[derive(Serialize)]
pub struct APIError {
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
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
    error(&format!("{}: {}\nError: {:?}", code, message, e));
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
        )
    }
}

// sqids
// Aligned with front. Main difference is that we don't have workspace ids in our core ids.
const RESOURCE_S_ID_MIN_LENGTH: u8 = 10;
const SHARD_KEY: u64 = 1;
const REGION: u64 = 1;

pub fn make_id(prefix: &str, id: u64) -> Result<String> {
    let sqids = Sqids::builder()
        .min_length(RESOURCE_S_ID_MIN_LENGTH)
        .build()?;
    let id = sqids.encode(&[REGION, SHARD_KEY, id])?;
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
