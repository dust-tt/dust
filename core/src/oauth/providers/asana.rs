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
    static ref OAUTH_ASANA_CLIENT_ID: String = env::var("OAUTH_ASANA_CLIENT_ID").unwrap();
    static ref OAUTH_ASANA_CLIENT_SECRET: String = env::var("OAUTH_ASANA_CLIENT_SECRET").unwrap();
}

pub struct AsanaConnectionProvider {}

impl AsanaConnectionProvider {
    pub fn new() -> Self {
        AsanaConnectionProvider {}
    }
}

#[async_trait]
impl Provider for AsanaConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Asana
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
            ("client_id", OAUTH_ASANA_CLIENT_ID.as_str()),
            ("client_secret", OAUTH_ASANA_CLIENT_SECRET.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let req = self
            .reqwest_client()
            .post("https://app.asana.com/-/oauth_token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params);

        let raw_json = execute_request(ConnectionProvider::Asana, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Asana"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Asana"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Asana"))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token.to_string(),
            None => Err(anyhow!("Missing `refresh_token` in response from Asana"))?,
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
            Ok(None) => Err(anyhow!("Missing refresh_token in Asana connection"))?,
            Err(e) => Err(e)?,
        };

        let req = self
            .reqwest_client()
            .post("https://app.asana.com/-/oauth_token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", OAUTH_ASANA_CLIENT_ID.as_str()),
                ("client_secret", OAUTH_ASANA_CLIENT_SECRET.as_str()),
                ("refresh_token", &refresh_token),
            ]);

        let raw_json = execute_request(ConnectionProvider::Asana, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Asana"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Asana"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Asana"))?,
        };

        // Asana may return a new refresh token
        let new_refresh_token = raw_json["refresh_token"]
            .as_str()
            .map(|t| t.to_string());

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: new_refresh_token,
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
