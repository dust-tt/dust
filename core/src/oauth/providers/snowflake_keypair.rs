use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
    },
    credential::Credential,
};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::json;

/// Handles key pair authentication for Snowflake MCP servers.
///
/// Unlike OAuth-based Snowflake authentication, this provider stores key pair credentials
/// and marks the connection as finalized without performing token exchange. The front-end
/// fetches credentials at runtime to authenticate directly with Snowflake.
pub struct SnowflakeKeyPairConnectionProvider;

impl SnowflakeKeyPairConnectionProvider {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Provider for SnowflakeKeyPairConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::SnowflakeKeyPair
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        // Credentials are stored in related_credentials by the front-end.
        // Mark connection as finalized without token exchange.
        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: String::new(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json: json!({}),
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "Key pair authentication does not support token refresh".to_string(),
        ))
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        Ok(raw_json.clone())
    }
}
