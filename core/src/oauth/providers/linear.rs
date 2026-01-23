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
    static ref OAUTH_LINEAR_CLIENT_ID: String = env::var("OAUTH_LINEAR_CLIENT_ID").unwrap();
    static ref OAUTH_LINEAR_CLIENT_SECRET: String = env::var("OAUTH_LINEAR_CLIENT_SECRET").unwrap();
}

pub struct LinearConnectionProvider {}

impl LinearConnectionProvider {
    pub fn new() -> Self {
        LinearConnectionProvider {}
    }
}

#[async_trait]
impl Provider for LinearConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Linear
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let params = [
            ("grant_type", "authorization_code"),
            ("client_id", OAUTH_LINEAR_CLIENT_ID.as_str()),
            ("client_secret", OAUTH_LINEAR_CLIENT_SECRET.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let req = self
            .reqwest_client()
            .post("https://api.linear.app/oauth/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params);

        let raw_json = execute_request(ConnectionProvider::Linear, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Linear"))?,
        };

        // Linear OAuth apps created after Oct 1, 2025 have 24-hour expiring tokens
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Linear"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Linear"))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token.to_string(),
            None => Err(anyhow!("Missing `refresh_token` in response from Linear"))?,
        };

        let access_token_expiry =
            Some(utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token: Some(refresh_token),
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing refresh_token in Linear connection"))?,
            Err(e) => Err(e)?,
        };

        let req = self
            .reqwest_client()
            .post("https://api.linear.app/oauth/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", OAUTH_LINEAR_CLIENT_ID.as_str()),
                ("client_secret", OAUTH_LINEAR_CLIENT_SECRET.as_str()),
                ("refresh_token", &refresh_token),
            ]);

        let raw_json = execute_request(ConnectionProvider::Linear, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Linear"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Linear"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Linear"))?,
        };

        let new_refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token.to_string(),
            None => Err(anyhow!("Missing `refresh_token` in response from Linear"))?,
        };

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: Some(new_refresh_token),
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
}
