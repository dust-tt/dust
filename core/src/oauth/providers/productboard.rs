use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        PROVIDER_TIMEOUT_SECONDS,
    },
    credential::Credential,
    providers::utils::execute_request,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use serde_json::json;
use std::env;

lazy_static! {
    static ref OAUTH_PRODUCTBOARD_CLIENT_ID: String =
        env::var("OAUTH_PRODUCTBOARD_CLIENT_ID").unwrap();
    static ref OAUTH_PRODUCTBOARD_CLIENT_SECRET: String =
        env::var("OAUTH_PRODUCTBOARD_CLIENT_SECRET").unwrap();
}

pub struct ProductboardConnectionProvider {}

impl ProductboardConnectionProvider {
    pub fn new() -> Self {
        ProductboardConnectionProvider {}
    }
}

#[async_trait]
impl Provider for ProductboardConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Productboard
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        // Exchange authorization code for access token
        // https://developer.productboard.com/docs/how-to-integrate-with-productboard-via-oauth2-developer-documentation
        let body = json!({
            "grant_type": "authorization_code",
            "code": code,
            "client_id": *OAUTH_PRODUCTBOARD_CLIENT_ID,
            "client_secret": *OAUTH_PRODUCTBOARD_CLIENT_SECRET,
            "redirect_uri": redirect_uri
        });

        let req = self
            .reqwest_client()
            .post("https://app.productboard.com/oauth2/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Productboard, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Productboard"
            ))?,
        };

        let refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        let access_token_expiry = raw_json["expires_in"]
            .as_u64()
            .map(|expires_in| crate::utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        // https://developer.productboard.com/docs/how-to-integrate-with-productboard-via-oauth2-developer-documentation
        // Refresh tokens are valid for 180 days or 60 minutes after being used
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => {
                return Err(ProviderError::ActionNotSupportedError(
                    "No refresh token available".to_string(),
                ))
            }
            Err(e) => return Err(ProviderError::InternalError(e)),
        };

        let body = json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": *OAUTH_PRODUCTBOARD_CLIENT_ID,
            "client_secret": *OAUTH_PRODUCTBOARD_CLIENT_SECRET
        });

        let req = self
            .reqwest_client()
            .post("https://app.productboard.com/oauth2/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Productboard, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in refresh response from Productboard"
            ))?,
        };

        let new_refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        let access_token_expiry = raw_json["expires_in"]
            .as_u64()
            .map(|expires_in| crate::utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry,
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
}
