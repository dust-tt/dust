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

pub struct SnowflakeConnectionProvider {}

impl SnowflakeConnectionProvider {
    pub fn new() -> Self {
        SnowflakeConnectionProvider {}
    }

    /// Gets the Snowflake credentials (client_id and client_secret) from the related credential
    pub async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Snowflake connection"))?;

        let content = credentials.unseal_encrypted_content()?;

        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Snowflake credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Snowflake credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }

    /// Builds the Snowflake token endpoint URL from the account identifier
    fn get_token_endpoint(snowflake_account: &str) -> String {
        format!(
            "https://{}.snowflakecomputing.com/oauth/token-request",
            snowflake_account.trim()
        )
    }
}

/// Snowflake OAuth documentation: https://docs.snowflake.com/en/user-guide/oauth-custom
/// Note: Snowflake OAuth requires an account identifier which should be stored in connection metadata.
#[async_trait]
impl Provider for SnowflakeConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Snowflake
    }

    fn reqwest_client(&self) -> reqwest::Client {
        // Snowflake provider makes requests to user-provided account URLs, so we use the untrusted egress proxy.
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
        // Extract account identifier from connection metadata
        let snowflake_account = connection
            .metadata()
            .get("snowflake_account")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `snowflake_account` in connection metadata for Snowflake")
            })?;

        // Get Snowflake client_id and client_secret using the helper
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = Self::get_token_endpoint(snowflake_account);

        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        // Snowflake uses Basic auth with client_id:client_secret
        let auth_header = format!(
            "Basic {}",
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{}:{}", client_id, client_secret)
            )
        );

        let req = self
            .reqwest_client()
            .post(&token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", &auth_header)
            .form(&params);

        let raw_json = execute_request(ConnectionProvider::Snowflake, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Snowflake"
            ))?,
        };

        // expires_in is the number of seconds until the token expires (typically 600 = 10 minutes).
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Snowflake"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Snowflake"))?,
        };

        // Snowflake returns refresh_token if OAUTH_ISSUE_REFRESH_TOKENS is set to TRUE
        let refresh_token = raw_json["refresh_token"].as_str().map(|t| t.to_string());

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            extra_metadata: None,
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token,
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
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Snowflake connection"))?,
            Err(e) => Err(e)?,
        };

        // Extract account identifier from connection metadata
        let snowflake_account = connection
            .metadata()
            .get("snowflake_account")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `snowflake_account` in connection metadata for Snowflake")
            })?;

        // Get Snowflake client_id and client_secret using the helper
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = Self::get_token_endpoint(snowflake_account);

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        // Snowflake uses Basic auth with client_id:client_secret
        let auth_header = format!(
            "Basic {}",
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{}:{}", client_id, client_secret)
            )
        );

        let req = self
            .reqwest_client()
            .post(&token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", &auth_header)
            .form(&params);

        let raw_json = execute_request(ConnectionProvider::Snowflake, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Snowflake"
            ))?,
        };

        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Snowflake"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Snowflake"))?,
        };

        // Snowflake may return a new refresh_token
        let new_refresh_token = raw_json["refresh_token"].as_str().map(|t| t.to_string());

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: new_refresh_token,
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
            } if *status == 400 || *status == 401 => {
                let is_revoked = message.contains("invalid_grant")
                    || message.contains("refresh_token")
                    || message.contains("expired");
                info!(message, is_revoked, status, "Snowflake OAuth error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other errors.
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
