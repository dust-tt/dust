use crate::{
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
use lazy_static::lazy_static;
use serde_json::json;
use std::env;
use tracing::info;

use super::utils::ProviderHttpRequestError;

lazy_static! {
    static ref OAUTH_JIRA_CLIENT_ID: String = env::var("OAUTH_JIRA_CLIENT_ID").unwrap();
    static ref OAUTH_JIRA_CLIENT_SECRET: String = env::var("OAUTH_JIRA_CLIENT_SECRET").unwrap();
}

pub struct JiraConnectionProvider {}

impl JiraConnectionProvider {
    pub fn new() -> Self {
        JiraConnectionProvider {}
    }
}

/// JIRA documentation: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
#[async_trait]
impl Provider for JiraConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Jira
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let body = json!({
            "grant_type": "authorization_code",
            "client_id": *OAUTH_JIRA_CLIENT_ID,
            "client_secret": *OAUTH_JIRA_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        });

        let req = self
            .reqwest_client()
            .post("https://auth.atlassian.com/oauth/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Jira, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from JIRA"))?,
        };
        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from JIRA"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from JIRA"))?,
        };
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from JIRA"))?,
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

    /// Note: JIRA hard expires refresh_tokens after 360 days.
    ///       JIRA expires access_tokens after 1 hour.
    ///       JIRA expires refresh_tokens after 30 days of inactivity.
    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in JIRA connection"))?,
            Err(e) => Err(e)?,
        };

        let body = json!({
            "grant_type": "refresh_token",
            "client_id": *OAUTH_JIRA_CLIENT_ID,
            "client_secret": *OAUTH_JIRA_CLIENT_SECRET,
            "refresh_token": refresh_token,
        });

        let req = self
            .reqwest_client()
            .post("https://auth.atlassian.com/oauth/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Jira, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from JIRA"))?,
        };
        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from JIRA"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from JIRA"))?,
        };
        // Use new refresh token if provided, otherwise keep the existing one.
        // Atlassian sometimes doesn't return a new refresh token in the response.
        let final_refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token.to_string(),
            None => {
                info!(
                    connection_id = connection.connection_id(),
                    "No refresh_token in JIRA response, keeping existing token"
                );
                refresh_token
            }
        };

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: Some(final_refresh_token),
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
                let is_revoked = message.contains("refresh_token is invalid");
                info!(message, is_revoked, "JIRA 403 error");
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
