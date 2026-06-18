use crate::{
    http::proxy_client::create_untrusted_egress_client_builder,
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        credential::Credential,
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use tracing::error;

pub struct WorkdayConnectionProvider {}

impl WorkdayConnectionProvider {
    pub fn new() -> Self {
        WorkdayConnectionProvider {}
    }

    /// Gets the Workday credentials (client_id and client_secret) from the related credential.
    pub async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Workday connection"))?;

        let content = credentials.unseal_encrypted_content()?;

        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Workday credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Workday credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }
}

#[async_trait]
impl Provider for WorkdayConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Workday
    }

    fn reqwest_client(&self) -> reqwest::Client {
        // Workday provider makes requests to user-provided tenant URLs, so we use the untrusted egress proxy.
        match create_untrusted_egress_client_builder().build() {
            Ok(client) => client,
            Err(e) => {
                error!(error = ?e, "Failed to create client with untrusted egress proxy");
                reqwest::Client::new()
            }
        }
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        // Extract tenant URL from connection metadata.
        let workday_tenant_url = connection
            .metadata()
            .get("workday_tenant_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `workday_tenant_url` in connection metadata for Workday")
            })?;

        // Decrypt and retrieve client_id and client_secret.
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = format!("{}/token", workday_tenant_url.trim_end_matches('/'));

        let params = [
            ("grant_type", "authorization_code"),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let req = self
            .reqwest_client()
            .post(&token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params);

        let raw_json = execute_request(ConnectionProvider::Workday, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Workday"))?,
        };
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Workday"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Workday"))?,
        };
        // TODO: confirm Workday returns a refresh_token on initial authorization without
        // requiring an explicit offline_access scope.
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from Workday"))?,
        };

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            extra_metadata: None,
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: Some(refresh_token.to_string()),
            raw_json,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        // Retrieve the stored refresh token.
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Workday connection"))?,
            Err(e) => Err(e)?,
        };

        // Extract tenant URL from connection metadata.
        let workday_tenant_url = connection
            .metadata()
            .get("workday_tenant_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `workday_tenant_url` in connection metadata for Workday")
            })?;

        // Decrypt and retrieve client_id and client_secret.
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = format!("{}/token", workday_tenant_url.trim_end_matches('/'));

        let params = [
            ("grant_type", "refresh_token"),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("refresh_token", &refresh_token),
        ];

        let req = self
            .reqwest_client()
            .post(&token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params);

        let raw_json = execute_request(ConnectionProvider::Workday, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Workday"))?,
        };
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Workday"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Workday"))?,
        };
        // TODO: confirm Workday always returns a new refresh_token on refresh (rotating tokens),
        // or if the original refresh_token remains valid (non-rotating). If non-rotating,
        // we should keep the existing token instead of requiring a new one here.
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from Workday"))?,
        };

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: Some(refresh_token.to_string()),
            raw_json,
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
