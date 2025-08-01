use crate::info;
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

pub struct GmailConnectionProvider {}

impl GmailConnectionProvider {
    pub fn new() -> Self {
        GmailConnectionProvider {}
    }

    /// Gets the Gmail credentials (client_id and client_secret) from the related credential
    pub async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Gmail connection"))?;

        let content = credentials.unseal_encrypted_content()?;
        let provider = credentials.provider();

        // Fetch credential
        if provider != CredentialProvider::Gmail {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected Gmail",
                provider
            ));
        }

        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Gmail credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Gmail credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }
}

#[async_trait]
impl Provider for GmailConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Gmail
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let body = json!({
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        });

        let req = self
            .reqwest_client()
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Gmail, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Gmail"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Gmail"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Gmail"))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from Gmail"))?,
        };

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: Some(refresh_token.to_string()),
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Gmail connection"))?,
            Err(e) => Err(e)?,
        };

        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let body = json!({
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        });

        let req = self
            .reqwest_client()
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Gmail, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Gmail"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Gmail"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Gmail"))?,
        };

        match raw_json["scope"].as_str() {
            Some(_) => (),
            None => Err(anyhow!("Missing `scope` in response from Gmail"))?,
        };

        match raw_json["token_type"].as_str() {
            Some(_) => (),
            None => Err(anyhow!("Missing `token_type` in response from Gmail"))?,
        };

        // Gmail does not return a new refresh token when refreshing an access token. So we
        // merge the new raw_json information in the existing one to preserve original refresh
        // token.
        let existing_raw_json = connection.unseal_raw_json()?;

        let mut merged_raw_json = match existing_raw_json {
            Some(serde_json::Value::Object(map)) => map,
            _ => Err(anyhow!("Invalid `raw_json` stored on connection."))?,
        };

        // We checked above the presence of each of these fields in raw_json.
        merged_raw_json["access_token"] = raw_json["access_token"].clone();
        merged_raw_json["expires_in"] = raw_json["expires_in"].clone();
        merged_raw_json["token_type"] = raw_json["token_type"].clone();
        merged_raw_json["scope"] = raw_json["scope"].clone();

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: Some(refresh_token.to_string()),
            raw_json: serde_json::Value::Object(merged_raw_json),
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

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        match &error {
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 400 => {
                let is_revoked = message.contains("invalid_grant");
                info!(message, is_revoked, "Gmail 400 error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other 400 errors.
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
