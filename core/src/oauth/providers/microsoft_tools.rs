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
    static ref OAUTH_MICROSOFT_TOOLS_CLIENT_ID: String =
        env::var("OAUTH_MICROSOFT_TOOLS_CLIENT_ID")
            .expect("OAUTH_MICROSOFT_TOOLS_CLIENT_ID environment variable must be set");
    static ref OAUTH_MICROSOFT_TOOLS_CLIENT_SECRET: String =
        env::var("OAUTH_MICROSOFT_TOOLS_CLIENT_SECRET")
            .expect("OAUTH_MICROSOFT_TOOLS_CLIENT_SECRET environment variable must be set");
}

pub struct MicrosoftToolsConnectionProvider {}

impl MicrosoftToolsConnectionProvider {
    pub fn new() -> Self {
        MicrosoftToolsConnectionProvider {}
    }

    fn handle_service_principal_credentials(
        &self,
        credential: &Credential,
        connection: &Connection,
    ) -> Result<(String, serde_json::Value), ProviderError> {
        // Credentials is a Microsoft service principal, use client_credentials grant type
        let content = credential.unseal_encrypted_content()?;
        let provider = credential.provider();

        if provider != CredentialProvider::MicrosoftTools {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected MicrosoftTools",
                provider
            ))?;
        }
        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in MicrosoftTools credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in MicrosoftTools credential"))?;

        Ok((
            format!(
                "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
                connection
                    .metadata()
                    .get("tenant_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!(
                        "Missing tenant_id in MicrosoftTools connection metadata"
                    ))?
            ),
            json!({
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
            }),
        ))
    }
}

#[async_trait]
impl Provider for MicrosoftToolsConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::MicrosoftTools
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let (url, body) = match related_credentials {
            Some(credential) => {
                self.handle_service_principal_credentials(&credential, connection)?
            }
            None => (
                "https://login.microsoftonline.com/common/oauth2/v2.0/token".to_string(),
                json!({
                    "grant_type": "authorization_code",
                    "client_id": *OAUTH_MICROSOFT_TOOLS_CLIENT_ID,
                    "client_secret": *OAUTH_MICROSOFT_TOOLS_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                }),
            ),
        };

        let req = self
            .reqwest_client()
            .post(url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::MicrosoftTools, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from MicrosoftTools"))?;

        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from MicrosoftTools"))?;

        let refresh_token = raw_json["refresh_token"].as_str();

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: refresh_token.map(|s| s.to_string()),
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let (url, body) = match related_credentials {
            Some(credential) => {
                self.handle_service_principal_credentials(&credential, connection)?
            }
            None => {
                let refresh_token = connection.unseal_refresh_token()?.ok_or_else(|| {
                    anyhow!("Missing `refresh_token` in MicrosoftTools connection")
                })?;

                (
                    "https://login.microsoftonline.com/common/oauth2/v2.0/token".to_string(),
                    json!({
                        "grant_type": "refresh_token",
                        "client_id": *OAUTH_MICROSOFT_TOOLS_CLIENT_ID,
                        "client_secret": *OAUTH_MICROSOFT_TOOLS_CLIENT_SECRET,
                        "refresh_token": refresh_token,
                    }),
                )
            }
        };

        let req = self
            .reqwest_client()
            .post(url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::MicrosoftTools, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from MicrosoftTools"))?;

        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from MicrosoftTools"))?;

        let refresh_token = raw_json["refresh_token"].as_str();

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: refresh_token.map(|s| s.to_string()),
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
