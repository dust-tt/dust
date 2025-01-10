use crate::{
    oauth::connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        ACCESS_TOKEN_REFRESH_BUFFER_MILLIS, PROVIDER_TIMEOUT_SECONDS,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::json;

pub struct MockConnectionProvider {}

impl MockConnectionProvider {
    pub fn new() -> Self {
        MockConnectionProvider {}
    }
}

#[async_trait]
impl Provider for MockConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Mock
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: "mock_access_token".to_string(),
            access_token_expiry: Some(utils::now() + ACCESS_TOKEN_REFRESH_BUFFER_MILLIS + 1000),
            refresh_token: Some("mock_refresh_token".to_string()),
            raw_json: json!({}),
        })
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult, ProviderError> {
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing `refresh_token` in Mock connection"))?;

        Ok(RefreshResult {
            access_token: "refreshed_mock_access_token".to_string(),
            access_token_expiry: Some(utils::now() + PROVIDER_TIMEOUT_SECONDS * 1000),
            refresh_token: Some(refresh_token),
            raw_json: json!({}),
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                map.remove("refresh_token");
                map.remove("expires_in");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };

        Ok(raw_json)
    }
}
