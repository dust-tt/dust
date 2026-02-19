use crate::{
    http::proxy_client::create_untrusted_egress_client_builder,
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
use tracing::{error, info};

use super::utils::ProviderHttpRequestError;

pub struct UkgReadyConnectionProvider {}

impl UkgReadyConnectionProvider {
    pub fn new() -> Self {
        UkgReadyConnectionProvider {}
    }

    pub fn get_instance_url(metadata: &serde_json::Value) -> Result<String> {
        match metadata["instance_url"].as_str() {
            Some(url) => Ok(url.trim_end_matches('/').to_string()),
            None => Err(anyhow!("UKG Ready instance URL is missing")),
        }
    }

    pub fn get_company_id(metadata: &serde_json::Value) -> Result<String> {
        match metadata["ukg_ready_company_id"].as_str() {
            Some(id) => Ok(id.to_string()),
            None => Err(anyhow!("UKG Ready company ID is missing")),
        }
    }

    pub fn get_code_verifier(metadata: &serde_json::Value) -> Result<String> {
        match metadata["code_verifier"].as_str() {
            Some(verifier) => Ok(verifier.to_string()),
            None => Err(anyhow!(
                "PKCE code_verifier is missing from connection metadata"
            )),
        }
    }

    /// Gets the UKG Ready client_id from the related credential
    pub async fn get_client_id(credentials: Option<Credential>) -> Result<String> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for UKG Ready connection"))?;

        let content = credentials.unseal_encrypted_content()?;
        let provider = credentials.provider();

        // Fetch credential
        if provider != CredentialProvider::UkgReady {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected UkgReady",
                provider
            ));
        }

        // Extract client ID
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in UKG Ready credential"))?;

        Ok(client_id.to_string())
    }
}

#[async_trait]
impl Provider for UkgReadyConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::UkgReady
    }

    fn reqwest_client(&self) -> reqwest::Client {
        // UKG Ready provider makes requests to user-provided instance URLs, so we use the untrusted egress proxy.
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
        let instance_url = Self::get_instance_url(&connection.metadata())?;
        let company_id = Self::get_company_id(&connection.metadata())?;
        let code_verifier = Self::get_code_verifier(&connection.metadata())?;

        let client_id = Self::get_client_id(related_credentials).await?;

        let mut form_data = std::collections::HashMap::new();
        form_data.insert("grant_type", "authorization_code");
        form_data.insert("client_id", &client_id);
        form_data.insert("code", code);
        form_data.insert("code_verifier", &code_verifier);
        form_data.insert("redirect_uri", redirect_uri);

        let token_url = format!(
            "{}/ta/rest/v2/companies/!{}/oauth2/token",
            instance_url, company_id
        );

        let req = self
            .reqwest_client()
            .post(&token_url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

        let raw_json = execute_request(ConnectionProvider::UkgReady, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from UKG Ready"))?;

        let expires_in = raw_json["expires_in"].as_u64().unwrap_or(30 * 60);

        // UKG Ready uses v1 refresh endpoint which only requires the access token
        // No refresh token is needed or used
        let access_token_expiry =
            Some(utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token: None,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let instance_url = Self::get_instance_url(&connection.metadata())?;
        let current_access_token = connection
            .unseal_access_token()?
            .ok_or_else(|| anyhow!("Missing `access_token` in UKG Ready connection"))?;

        // The UKG team has asked us to use the v1 refresh endpoint
        let token_url = format!("{}/ta/rest/v1/refresh-token", instance_url);

        let req = self
            .reqwest_client()
            .get(&token_url)
            .header("Authorization", format!("Bearer {}", current_access_token))
            .header("Accept", "application/json");

        let raw_json = execute_request(ConnectionProvider::UkgReady, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let new_access_token = raw_json["token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `token` in refresh response from UKG Ready"))?;

        // v1 returns "ttl" with a "units" field specifying the time unit
        let ttl = raw_json["ttl"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `ttl` in refresh response from UKG Ready"))?;

        let units = raw_json["units"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `units` in refresh response from UKG Ready"))?;

        // Convert TTL to seconds based on the units field
        let expires_in = match units {
            "milliseconds" => ttl / 1000,
            "seconds" => ttl,
            _ => Err(anyhow!(
                "Unknown time unit '{}' in UKG Ready refresh response",
                units
            ))?,
        };

        // UKG Ready refresh requires a valid access token (not a refresh token)
        let access_token_expiry =
            Some(utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(RefreshResult {
            access_token: new_access_token.to_string(),
            access_token_expiry,
            refresh_token: None,
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                map.remove("refresh_token");
                map.remove("token");
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
                // Check if the error indicates token revocation/expiration
                let msg_lower = message.to_lowercase();
                let is_revoked = msg_lower.contains("invalid_grant")
                    || msg_lower.contains("refresh_token")
                    || msg_lower.contains("expired")
                    || msg_lower.contains("timeout")
                    || msg_lower.contains("unauthorized");
                info!(message, is_revoked, status, "UKG Ready OAuth error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    self.default_handle_provider_request_error(error)
                }
            }
            _ => self.default_handle_provider_request_error(error),
        }
    }
}
