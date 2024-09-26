use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use std::env;

lazy_static! {
    static ref OAUTH_GONG_CLIENT_ID: String = env::var("OAUTH_GONG_CLIENT_ID").unwrap();
    static ref OAUTH_GONG_CLIENT_SECRET: String = env::var("OAUTH_GONG_CLIENT_SECRET").unwrap();
}

pub fn create_gong_basic_auth_token() -> String {
    let credentials = format!("{}:{}", *OAUTH_GONG_CLIENT_ID, *OAUTH_GONG_CLIENT_SECRET);
    format!("Basic {}", general_purpose::STANDARD.encode(credentials))
}

pub struct GongConnectionProvider {}

impl GongConnectionProvider {
    pub fn new() -> Self {
        GongConnectionProvider {}
    }
}

#[async_trait]
impl Provider for GongConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Gong
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let authorization = create_gong_basic_auth_token();

        let params = [
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("client_id", &*OAUTH_GONG_CLIENT_ID),
            ("redirect_uri", &redirect_uri),
        ];

        let req = reqwest::Client::new()
            .post("https://app.gong.io/oauth2/generate-customer-token")
            .header("Content-Type", "application/json")
            .header("Authorization", authorization)
            .query(&params);

        let raw_json = execute_request(ConnectionProvider::Gong, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Gong"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Gong"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Gong"))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from Gong"))?,
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
        })
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Gong connection"))?,
            Err(e) => Err(e)?,
        };

        let authorization = create_gong_basic_auth_token();

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        let req = reqwest::Client::new()
            .post("https://app.gong.io/oauth2/generate-customer-token")
            .header("Content-Type", "application/json")
            .header("Authorization", authorization)
            .query(&params);

        let raw_json = execute_request(ConnectionProvider::Gong, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Gong"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Gong"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Gong"))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from Gong"))?,
        };

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
}
