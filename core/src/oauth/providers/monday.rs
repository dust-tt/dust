use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        PROVIDER_TIMEOUT_SECONDS,
    },
    credential::Credential,
    providers::utils::execute_request,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use std::env;

lazy_static! {
    static ref OAUTH_MONDAY_CLIENT_ID: String = env::var("OAUTH_MONDAY_CLIENT_ID").unwrap();
    static ref OAUTH_MONDAY_CLIENT_SECRET: String = env::var("OAUTH_MONDAY_CLIENT_SECRET").unwrap();
}

pub struct MondayConnectionProvider {}

impl MondayConnectionProvider {
    pub fn new() -> Self {
        MondayConnectionProvider {}
    }
}

#[async_trait]
impl Provider for MondayConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Monday
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let params = [
            ("grant_type", "authorization_code"),
            ("client_id", &*OAUTH_MONDAY_CLIENT_ID),
            ("client_secret", &*OAUTH_MONDAY_CLIENT_SECRET),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let req = self
            .reqwest_client()
            .post("https://auth.monday.com/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params);

        let result = execute_request(ConnectionProvider::Monday, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        // Monday.com tokens expire in 30 days
        let expires_in = result["expires_in"].as_u64().unwrap_or(30 * 24 * 60 * 60); // Default to 30 days if not provided

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: result["access_token"]
                .as_str()
                .ok_or_else(|| anyhow!("Missing access_token in response"))?
                .to_string(),
            access_token_expiry: Some(
                crate::utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: result["refresh_token"].as_str().map(|s| s.to_string()),
            raw_json: result,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing refresh_token in Monday connection"))?;

        let params = [
            ("grant_type", "refresh_token"),
            ("client_id", &*OAUTH_MONDAY_CLIENT_ID),
            ("client_secret", &*OAUTH_MONDAY_CLIENT_SECRET),
            ("refresh_token", &refresh_token),
        ];

        let req = self
            .reqwest_client()
            .post("https://auth.monday.com/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params);

        let result = execute_request(ConnectionProvider::Monday, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let expires_in = result["expires_in"].as_u64().unwrap_or(30 * 24 * 60 * 60); // Default to 30 days if not provided

        Ok(RefreshResult {
            access_token: result["access_token"]
                .as_str()
                .ok_or_else(|| anyhow!("Missing access_token in response"))?
                .to_string(),
            access_token_expiry: Some(
                crate::utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: result["refresh_token"].as_str().map(|s| s.to_string()),
            raw_json: result,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let mut scrubbed = raw_json.clone();
        if let Some(obj) = scrubbed.as_object_mut() {
            obj.remove("access_token");
            obj.remove("refresh_token");
        }
        Ok(scrubbed)
    }
}
