use crate::{
    oauth::{
        connection::{
            provider_timeout_seconds, Connection, ConnectionProvider, FinalizeResult, Provider,
            ProviderError, RefreshResult,
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

const JIRA_INVALID_GRANT_FRAGMENT: &str = "invalid_grant";
const JIRA_INVALID_REFRESH_TOKEN_FRAGMENT: &str = "refresh_token is invalid";
const JIRA_INVALID_REFRESH_TOKEN_WITH_SPACES_FRAGMENT: &str = "refresh token is invalid";
const JIRA_INVALID_REFRESH_TOKEN_GENERIC_FRAGMENT: &str = "invalid refresh token";
const JIRA_GLOBAL_REVOCATION_FRAGMENT: &str = "globally revoked";

pub struct JiraConnectionProvider {}

impl JiraConnectionProvider {
    pub fn new() -> Self {
        JiraConnectionProvider {}
    }
}

fn is_jira_refresh_token_revoked(status: u16, message: &str) -> bool {
    if !matches!(status, 400 | 401 | 403) {
        return false;
    }

    let message = message.to_lowercase();
    message.contains(JIRA_INVALID_GRANT_FRAGMENT)
        || message.contains(JIRA_INVALID_REFRESH_TOKEN_FRAGMENT)
        || message.contains(JIRA_INVALID_REFRESH_TOKEN_WITH_SPACES_FRAGMENT)
        || message.contains(JIRA_INVALID_REFRESH_TOKEN_GENERIC_FRAGMENT)
        || message.contains(JIRA_GLOBAL_REVOCATION_FRAGMENT)
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
                utils::now()
                    + (expires_in - provider_timeout_seconds(ConnectionProvider::Jira)) * 1000,
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
                utils::now()
                    + (expires_in - provider_timeout_seconds(ConnectionProvider::Jira)) * 1000,
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
            } => {
                let is_revoked = is_jira_refresh_token_revoked(*status, message);
                info!(message, is_revoked, status, "JIRA OAuth error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for non-revocation errors.
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

#[cfg(test)]
mod tests {
    use super::{is_jira_refresh_token_revoked, JiraConnectionProvider};
    use crate::oauth::{
        connection::{ConnectionProvider, Provider, ProviderError},
        providers::utils::ProviderHttpRequestError,
    };

    #[test]
    fn detects_jira_revoked_refresh_token_errors() {
        assert!(is_jira_refresh_token_revoked(400, "invalid_grant"));
        assert!(is_jira_refresh_token_revoked(
            403,
            "refresh_token is invalid"
        ));
        assert!(is_jira_refresh_token_revoked(
            403,
            "Token was globally revoked"
        ));
        assert!(is_jira_refresh_token_revoked(401, "invalid refresh token"));
    }

    #[test]
    fn ignores_non_revocation_errors() {
        assert!(!is_jira_refresh_token_revoked(403, "rate limit exceeded"));
        assert!(!is_jira_refresh_token_revoked(500, "invalid_grant"));
    }

    #[test]
    fn maps_revoked_refresh_failures_to_token_revoked_error() {
        let provider = JiraConnectionProvider::new();
        let error =
            provider.handle_provider_request_error(ProviderHttpRequestError::RequestFailed {
                provider: ConnectionProvider::Jira,
                status: 400,
                message: "invalid_grant".to_string(),
            });

        assert!(matches!(error, ProviderError::TokenRevokedError));
    }
}
