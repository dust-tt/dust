use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
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
    static ref OAUTH_INTERCOM_CLIENT_ID: String = env::var("OAUTH_INTERCOM_CLIENT_ID").unwrap();
    static ref OAUTH_INTERCOM_CLIENT_SECRET: String =
        env::var("OAUTH_INTERCOM_CLIENT_SECRET").unwrap();
}

pub struct IntercomConnectionProvider {}

impl IntercomConnectionProvider {
    pub fn new() -> Self {
        IntercomConnectionProvider {}
    }
}

#[async_trait]
impl Provider for IntercomConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Intercom
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
            "client_id": *OAUTH_INTERCOM_CLIENT_ID,
            "client_secret": *OAUTH_INTERCOM_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        });

        let req = reqwest::Client::new()
            .post("https://api.intercom.io/auth/eagle/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Intercom, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Intercom"))?,
        };

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json,
        })
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "Intercom access tokens do not expire".to_string(),
        ))?
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                map.remove("token");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };
        Ok(raw_json)
    }
}
