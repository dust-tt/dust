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
use lazy_static::lazy_static;
use regex::Regex;
use serde_json::json;
use std::env;

use super::utils::ProviderHttpRequestError;

lazy_static! {
    static ref OAUTH_MICROSOFT_CLIENT_ID: String = env::var("OAUTH_MICROSOFT_CLIENT_ID").unwrap();
    static ref OAUTH_MICROSOFT_CLIENT_SECRET: String =
        env::var("OAUTH_MICROSOFT_CLIENT_SECRET").unwrap();
}

pub struct MicrosoftConnectionProvider {}

impl MicrosoftConnectionProvider {
    pub fn new() -> Self {
        MicrosoftConnectionProvider {}
    }
}

#[async_trait]
impl Provider for MicrosoftConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Microsoft
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let body = match _related_credentials {
            Some(credential) => {
                // Credentials is a Microsoft service principal, use client_credentials grant type
                let content = credential.unseal_encrypted_content()?;
                let provider = credential.provider();

                if provider != CredentialProvider::Microsoft {
                    return Err(anyhow!(
                        "Invalid credential provider: {:?}, expected Microsoft",
                        provider
                    ))?;
                }
                // Extract client ID and secret
                let client_id = content
                    .get("client_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing client_id in Microsoft credential"))?;

                let client_secret = content
                    .get("client_secret")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing client_secret in Microsoft credential"))?;

                json!({
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                })
            }
            None => json!({
                "grant_type": "authorization_code",
                "client_id": *OAUTH_MICROSOFT_CLIENT_ID,
                "client_secret": *OAUTH_MICROSOFT_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
                "scope": "User.Read Sites.Read.All Directory.Read.All Files.Read.All Team.ReadBasic.All ChannelSettings.Read.All ChannelMessage.Read.All",
            }),
        };

        let req = self
            .reqwest_client()
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::Microsoft, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Microsoft"))?;

        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Microsoft"))?;

        let refresh_token = raw_json["refresh_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `refresh_token` in response from Microsoft"))?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
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
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing `refresh_token` in Microsoft connection"))?;

        let body = json!({
            "grant_type": "refresh_token",
            "client_id": *OAUTH_MICROSOFT_CLIENT_ID,
            "client_secret": *OAUTH_MICROSOFT_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "scope": "User.Read Sites.Read.All Directory.Read.All Files.Read.All Team.ReadBasic.All ChannelSettings.Read.All ChannelMessage.Read.All",
        });

        let req = self
            .reqwest_client()
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::Microsoft, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Microsoft"))?;

        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Microsoft"))?;

        let refresh_token = raw_json["refresh_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `refresh_token` in response from Microsoft"))?;

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

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        let app_disabled_regex = Regex::new(r"Application.*is disabled").unwrap();

        match &error {
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 400 => {
                if message.contains("invalid_grant")
                    && message.contains(
                        "The user or administrator has not consented to use the application",
                    )
                {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other 400 errors.
                    self.default_handle_provider_request_error(error)
                }
            }
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 403 => {
                if app_disabled_regex.is_match(message) {
                    ProviderError::TokenRevokedError
                } else {
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
