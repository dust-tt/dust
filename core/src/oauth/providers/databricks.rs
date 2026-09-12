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
use tracing::{error, info};

use super::utils::ProviderHttpRequestError;

pub struct DatabricksConnectionProvider {}

impl DatabricksConnectionProvider {
    pub fn new() -> Self {
        DatabricksConnectionProvider {}
    }

    /// Gets the Databricks credentials (client_id and client_secret) from the related credential
    pub async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Databricks connection"))?;

        let content = credentials.unseal_encrypted_content()?;

        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Databricks credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Databricks credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }
}

/// Databricks OAuth documentation: https://docs.databricks.com/en/dev-tools/auth/oauth-m2m.html
/// Note: Databricks OAuth requires a workspace URL which should be stored in connection metadata.
#[async_trait]
impl Provider for DatabricksConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Databricks
    }

    fn reqwest_client(&self) -> reqwest::Client {
        // Databricks provider makes requests to user-provided workspace URLs, so we use the untrusted egress proxy.
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
        // Extract workspace URL from connection metadata
        let databricks_workspace_url = connection
            .metadata()
            .get("databricks_workspace_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `databricks_workspace_url` in connection metadata for Databricks")
            })?;

        // Get Databricks client_id and client_secret using the helper
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = format!(
            "{}/oidc/v1/token",
            databricks_workspace_url.trim_end_matches('/')
        );

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

        let raw_json = execute_request(ConnectionProvider::Databricks, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Databricks"
            ))?,
        };
        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Databricks"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Databricks"))?,
        };
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `refresh_token` in response from Databricks"
            ))?,
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
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Databricks connection"))?,
            Err(e) => Err(e)?,
        };

        // Extract workspace URL from connection metadata
        let databricks_workspace_url = connection
            .metadata()
            .get("databricks_workspace_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `databricks_workspace_url` in connection metadata for Databricks")
            })?;

        // Get Databricks client_id and client_secret using the helper
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = format!(
            "{}/oidc/v1/token",
            databricks_workspace_url.trim_end_matches('/')
        );

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

        let raw_json = execute_request(ConnectionProvider::Databricks, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Databricks"
            ))?,
        };
        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Databricks"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Databricks"))?,
        };
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `refresh_token` in response from Databricks"
            ))?,
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
                // Misleading for end-user (relative to refresh time).
                map.remove("expires_in");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };
        Ok(raw_json)
    }

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        match &error {
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 403 => {
                let is_revoked = message.contains("refresh_token is invalid")
                    || message.contains("token is invalid");
                info!(message, is_revoked, "Databricks 403 error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other 403 errors.
                    self.default_handle_provider_request_error(error)
                }
            }
            _ => {
                // Call the default implementation for other cases.
                self.default_handle_provider_request_error(error)
            }
        }
    }
}
