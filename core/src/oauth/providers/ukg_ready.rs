use crate::{
    http::proxy_client::create_untrusted_egress_client_builder,
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
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

    /// Gets the UKG Ready client_id and client_secret from the related credential
    pub async fn get_client_credentials(
        credentials: Option<Credential>,
    ) -> Result<(String, String)> {
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

        // Extract client ID and client secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in UKG Ready credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in UKG Ready credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
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

        let (client_id, client_secret) = Self::get_client_credentials(related_credentials).await?;

        let mut form_data = std::collections::HashMap::new();
        form_data.insert("grant_type", "authorization_code");
        form_data.insert("client_id", &client_id);
        form_data.insert("client_secret", &client_secret);
        form_data.insert("code", code);
        form_data.insert("redirect_uri", redirect_uri);

        // Use !{company_id} format per UKG Ready docs for company reference
        let token_url = format!(
            "{}/ta/rest/v2/companies/!{}/oauth2/token",
            instance_url, company_id
        );

        tracing::info!(
            token_url = %token_url,
            client_id = %client_id,
            "UKG Ready token request (authorization_code)"
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

        let refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());
        let expires_in = raw_json["expires_in"].as_u64().unwrap_or(30 * 60);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(utils::now() + expires_in * 1000),
            refresh_token,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let instance_url = Self::get_instance_url(&connection.metadata())?;
        let company_id = Self::get_company_id(&connection.metadata())?;
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing `refresh_token` in UKG Ready connection"))?;

        let (client_id, client_secret) = Self::get_client_credentials(related_credentials).await?;

        let mut form_data = std::collections::HashMap::new();
        form_data.insert("grant_type", "refresh_token");
        form_data.insert("client_id", &client_id);
        form_data.insert("client_secret", &client_secret);
        form_data.insert("refresh_token", &refresh_token);

        // Use !{company_id} format per UKG Ready docs for company reference
        let req = self
            .reqwest_client()
            .post(format!(
                "{}/ta/rest/v2/companies/!{}/oauth2/token",
                instance_url, company_id
            ))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

        let raw_json = execute_request(ConnectionProvider::UkgReady, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from UKG Ready"))?;

        let new_refresh_token = raw_json["refresh_token"]
            .as_str()
            .map(|s| s.to_string())
            .or(Some(refresh_token));
        let expires_in = raw_json["expires_in"].as_u64().unwrap_or(30 * 60);

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(utils::now() + expires_in * 1000),
            refresh_token: new_refresh_token,
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                map.remove("refresh_token");
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
