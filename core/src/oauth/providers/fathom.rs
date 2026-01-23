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
use std::env;

lazy_static! {
    static ref OAUTH_FATHOM_CLIENT_ID: String = env::var("OAUTH_FATHOM_CLIENT_ID").unwrap();
    static ref OAUTH_FATHOM_CLIENT_SECRET: String = env::var("OAUTH_FATHOM_CLIENT_SECRET").unwrap();
}

pub struct FathomConnectionProvider {}

impl FathomConnectionProvider {
    pub fn new() -> Self {
        FathomConnectionProvider {}
    }
}

/// Fathom documentation: https://developers.fathom.ai/sdks/oauth
#[async_trait]
impl Provider for FathomConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Fathom
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let body = format!(
            "grant_type=authorization_code&code={}&client_id={}&client_secret={}&redirect_uri={}",
            code, *OAUTH_FATHOM_CLIENT_ID, *OAUTH_FATHOM_CLIENT_SECRET, redirect_uri
        );

        let req = self
            .reqwest_client()
            .post("https://fathom.video/external/v1/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body);

        let raw_json = execute_request(ConnectionProvider::Fathom, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Fathom"))?,
        };

        let access_token_expiry = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(expires_in) => {
                    Some(utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000)
                }
                None => None,
            },
            _ => None,
        };

        let refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            extra_metadata: None,
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token,
            raw_json,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => {
                return Err(ProviderError::ActionNotSupportedError(
                    "Fathom connection has no refresh token".to_string(),
                ))
            }
            Err(e) => Err(e)?,
        };

        let body = format!(
            "grant_type=refresh_token&refresh_token={}&client_id={}&client_secret={}",
            refresh_token, *OAUTH_FATHOM_CLIENT_ID, *OAUTH_FATHOM_CLIENT_SECRET
        );

        let req = self
            .reqwest_client()
            .post("https://fathom.video/external/v1/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body);

        let raw_json = execute_request(ConnectionProvider::Fathom, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Fathom"))?,
        };

        let access_token_expiry = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(expires_in) => {
                    Some(utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000)
                }
                None => None,
            },
            _ => None,
        };

        let refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token,
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
}
