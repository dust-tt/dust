use crate::
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        },
        providers::utils::execute_request,
    }
;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use std::env;
use serde_json::json;

lazy_static! {
    static ref OAUTH_ZENDESK_CLIENT_ID: String = env::var("OAUTH_ZENDESK_CLIENT_ID").unwrap();
    static ref OAUTH_ZENDESK_CLIENT_SECRET: String = env::var("OAUTH_ZENDESK_CLIENT_SECRET").unwrap();
}

pub struct ZendeskConnectionProvider {}

impl ZendeskConnectionProvider {
    pub fn new() -> Self {
        ZendeskConnectionProvider {}
    }
}

#[async_trait]
impl Provider for ZendeskConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Zendesk
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {

      let body = json!({
        "grant_type": "authorization_code",
        "client_id": *OAUTH_ZENDESK_CLIENT_ID,
        "client_secret": *OAUTH_ZENDESK_CLIENT_SECRET,
        "code": code,
        "redirect_uri": redirect_uri,
        "scope": "tickets:write hc:write"
      });


        let req = reqwest::Client::new()
          .post("https://d3v-dust.zendesk.com/api/v2/oauth/tokens")
          .header("Content-Type", "application/json")
          .json(&body);

        let raw_json = execute_request(ConnectionProvider::Zendesk, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Zendesk"))?,
        };

        // The flow doesn't use refresh tokens. The access token doesn't expire.
        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json,
        })
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult, ProviderError> {
        let access_token = match connection.unseal_access_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Error getting `access_token` from Zendesk connection"))?,
            Err(e) => Err(e)?,
        };

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json: None.unwrap_or_default()
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };

        Ok(raw_json)
    }
}
