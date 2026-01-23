use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        credential::{Credential, CredentialProvider},
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::json;

use super::utils::ProviderHttpRequestError;

const VANTA_TOKEN_ENDPOINT: &str = "https://api.vanta.com/oauth/token";
const VANTA_SCOPE: &str = "vanta-api.all:read";

pub struct VantaConnectionProvider {}

impl VantaConnectionProvider {
    pub fn new() -> Self {
        Self {}
    }

    async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Vanta connection"))?;

        let content = credentials.unseal_encrypted_content()?;
        let provider = credentials.provider();

        if provider != CredentialProvider::Vanta {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected Vanta",
                provider
            ));
        }

        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Vanta credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Vanta credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }

    async fn request_token(
        &self,
        client_id: &str,
        client_secret: &str,
    ) -> Result<serde_json::Value, ProviderError> {
        let body = json!({
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": VANTA_SCOPE,
            "grant_type": "client_credentials",
        });

        let req = self
            .reqwest_client()
            .post(VANTA_TOKEN_ENDPOINT)
            .header("Content-Type", "application/json")
            .json(&body);

        execute_request(ConnectionProvider::Vanta, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))
    }
}

#[async_trait]
impl Provider for VantaConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Vanta
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;
        let raw_json = self.request_token(&client_id, &client_secret).await?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Vanta"))?;
        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Vanta"))?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in.saturating_sub(PROVIDER_TIMEOUT_SECONDS)) * 1000,
            ),
            refresh_token: None,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;
        let raw_json = self.request_token(&client_id, &client_secret).await?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Vanta"))?;
        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Vanta"))?;

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in.saturating_sub(PROVIDER_TIMEOUT_SECONDS)) * 1000,
            ),
            refresh_token: None,
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let mut map = match raw_json.clone() {
            serde_json::Value::Object(map) => map,
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };
        map.remove("access_token");
        map.remove("expires_in");
        Ok(serde_json::Value::Object(map))
    }

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        self.default_handle_provider_request_error(error)
    }
}
