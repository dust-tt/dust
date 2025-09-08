use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
    },
    credential::Credential,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::json;

pub struct OpenAIConnectionProvider {}

impl OpenAIConnectionProvider {
    pub fn new() -> Self {
        OpenAIConnectionProvider {}
    }
}

#[async_trait]
impl Provider for OpenAIConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Openai
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        _code: &str,
        _redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let client_id = connection
            .metadata()
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ProviderError::InternalError(anyhow!("Missing client_id in connection metadata"))
            })?;

        // Validate that it looks like an OpenAI Admin API key
        if !client_id.starts_with("sk-admin-") {
            return Err(ProviderError::InternalError(anyhow!(
                "Invalid OpenAI Admin API key format. Must start with 'sk-admin-'"
            )));
        }

        // OpenAI Admin API bearer token provider - stores the API key as the access token
        let result = FinalizeResult {
            redirect_uri: "".to_string(), // Not used for bearer token flow
            code: "direct".to_string(),
            access_token: client_id.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json: json!({
                "access_token": client_id,
                "token_type": "bearer",
                "scope": "usage.read"
            }),
            extra_metadata: Some({
                let mut map = serde_json::Map::new();
                map.insert("provider".to_string(), json!("openai_admin"));
                map.insert("scope".to_string(), json!("usage.read"));
                map
            }),
        };

        Ok(result)
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "OpenAI Admin API keys do not support refresh".to_string(),
        ))
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };
        Ok(raw_json)
    }
}
