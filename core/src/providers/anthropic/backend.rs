use crate::gcp_auth::get_gcp_access_token;
use crate::run::Credentials;
use anyhow::{anyhow, Result};
use hyper::Uri;
use reqwest::header::HeaderMap;
use serde_json::{json, Value};
use std::str::FromStr;
use tracing::info;

#[async_trait::async_trait]
pub trait AnthropicBackend {
    async fn initialize(&mut self, credentials: &Credentials) -> Result<String>;
    fn messages_uri(&self, model_id: &str) -> Result<Uri>;
    fn build_headers(&self, beta_flags: &[&str]) -> Result<HeaderMap>;
    fn build_request_body(&self, base_body: Value, model_id: &str) -> Value;
}

// Direct Anthropic backend.

pub struct DirectAnthropicBackend {
    api_key: Option<String>,
}

impl DirectAnthropicBackend {
    pub fn new() -> Self {
        Self { api_key: None }
    }
}

#[async_trait::async_trait]
impl AnthropicBackend for DirectAnthropicBackend {
    async fn initialize(&mut self, credentials: &Credentials) -> Result<String> {
        let api_key = match credentials.get("ANTHROPIC_API_KEY") {
            Some(api_key) => api_key.clone(),
            None => match tokio::task::spawn_blocking(|| std::env::var("ANTHROPIC_API_KEY")).await?
            {
                Ok(key) => key,
                Err(_) => {
                    return Err(anyhow!(
                        "Credentials or environment variable `ANTHROPIC_API_KEY` is not set."
                    ))
                }
            },
        };

        self.api_key = Some(api_key.clone());
        Ok(api_key)
    }

    fn messages_uri(&self, _model_id: &str) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/messages".parse()?)
    }

    fn build_headers(&self, beta_flags: &[&str]) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse()?);

        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow!("ANTHROPIC_API_KEY is not set."))?;

        headers.insert("X-API-Key", api_key.parse()?);
        headers.insert("anthropic-version", "2023-06-01".parse()?);

        for flag in beta_flags {
            headers.insert("anthropic-beta", flag.parse()?);
        }
        Ok(headers)
    }

    fn build_request_body(&self, mut base_body: Value, model_id: &str) -> Value {
        base_body["model"] = json!(model_id);
        base_body
    }
}

// Fallback.

/// Anthropic models that can be routed through Vertex AI as a fallback.
///
/// This enum serves as a type-safe registry of models that have verified mappings to Vertex AI's
/// Anthropic publisher models. Only models listed here will be eligible for Vertex AI fallback
/// when the feature flag `anthropic_vertex_fallback` is enabled.
///
/// # Adding New Models
///
/// To add support for a new model:
/// 1. Add a new variant to this enum
/// 2. Update the `FromStr` implementation to parse the model ID
/// 3. Update `vertex_model_name()` to provide the Vertex AI mapping
///
/// # Fallback Strategy
///
/// Some mappings may not be 1:1 - we can map newer/unavailable Anthropic models to the closest
/// available model on Vertex AI (e.g., Opus -> Sonnet).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VertexSupportedModel {
    Claude4Sonnet20250514,
}

impl FromStr for VertexSupportedModel {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "claude-4-sonnet-20250514" => Ok(Self::Claude4Sonnet20250514),
            _ => Err(anyhow::anyhow!("Model {} not supported on Vertex AI", s)),
        }
    }
}

impl VertexSupportedModel {
    pub fn vertex_model_name(self) -> &'static str {
        match self {
            Self::Claude4Sonnet20250514 => "claude-sonnet-4@20250514",
        }
    }
}

pub fn should_use_vertex_for_model(model_id: &str) -> bool {
    model_id.parse::<VertexSupportedModel>().is_ok()
}

pub fn map_anthropic_model_to_vertex_model(model_id: &str) -> Result<String, anyhow::Error> {
    let model: VertexSupportedModel = model_id.parse()?;
    Ok(model.vertex_model_name().to_string())
}

// Vertex Anthropic backend.

pub struct VertexAnthropicBackend {
    api_key: Option<String>,
    project_id: Option<String>,
    location: Option<String>,
}

impl VertexAnthropicBackend {
    pub fn new() -> Self {
        Self {
            api_key: None,
            location: None,
            project_id: None,
        }
    }
}

#[async_trait::async_trait]
impl AnthropicBackend for VertexAnthropicBackend {
    async fn initialize(&mut self, credentials: &Credentials) -> Result<String> {
        let api_key = get_gcp_access_token().await?;

        let project_id = match credentials.get("GOOGLE_CLOUD_PROJECT_ID") {
            Some(project_id) => project_id.clone(),
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("GOOGLE_CLOUD_PROJECT_ID"))
                    .await?
                {
                    Ok(project_id) => project_id,
                    Err(_) => {
                        return Err(anyhow!(
                        "Credentials or environment variable `GOOGLE_CLOUD_PROJECT_ID` is not set."
                    ))
                    }
                }
            }
        };

        let location = match credentials.get("GOOGLE_CLOUD_LOCATION") {
            Some(location) => location.clone(),
            None => match tokio::task::spawn_blocking(|| std::env::var("GOOGLE_CLOUD_LOCATION"))
                .await?
            {
                Ok(location) => location,
                Err(_) => "us-south1".to_string(), // Default fallback region.
            },
        };

        self.api_key = Some(api_key.clone());
        self.project_id = Some(project_id);
        self.location = Some(location);

        Ok(api_key)
    }

    fn messages_uri(&self, model_id: &str) -> Result<Uri> {
        let project_id = self
            .project_id
            .as_ref()
            .ok_or_else(|| anyhow!("VertexAnthropicBackend not initialized: missing project_id"))?;
        let location = self
            .location
            .as_ref()
            .ok_or_else(|| anyhow!("VertexAnthropicBackend not initialized: missing location"))?;
        let vertex_model_id = match map_anthropic_model_to_vertex_model(model_id) {
            Ok(model) => model,
            Err(_) => return Err(anyhow!("Unsupported model: {}", model_id)),
        };

        info!(
            model_id = model_id,
            fallback_model = vertex_model_id,
            "Fallback to Vertex Anthropic"
        );

        let base_url = match location.as_str() {
            "global" => "https://aiplatform.googleapis.com".to_string(),
            _ => format!("https://{}-aiplatform.googleapis.com", location),
        };

        let uri = format!(
            "{}/v1/projects/{}/locations/{}/publishers/anthropic/models/{}:streamRawPredict",
            base_url, project_id, location, vertex_model_id
        );
        Ok(uri.parse()?)
    }

    fn build_headers(&self, _beta_flags: &[&str]) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse()?);

        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow!("Could not get GCP access token."))?;

        headers.insert("Authorization", format!("Bearer {}", api_key).parse()?);

        Ok(headers)
    }

    fn build_request_body(&self, mut base_body: Value, _model_id: &str) -> Value {
        base_body["anthropic_version"] = json!("vertex-2023-10-16");
        // Don't include model in body for Vertex (it's in URL)
        base_body
    }
}
