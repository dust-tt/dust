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
use regex::Regex;
use serde_json::json;
use std::env;

lazy_static! {
    static ref OAUTH_ZENDESK_CLIENT_ID: String = env::var("OAUTH_ZENDESK_CLIENT_ID").unwrap();
    static ref OAUTH_ZENDESK_CLIENT_SECRET: String =
        env::var("OAUTH_ZENDESK_CLIENT_SECRET").unwrap();
    static ref ZENDESK_SUBDOMAIN_RE: Regex =
        Regex::new(r"^[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?$").unwrap();
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
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let body = json!({
            "grant_type": "authorization_code",
            "code": code,
            "client_id": *OAUTH_ZENDESK_CLIENT_ID,
            "client_secret": *OAUTH_ZENDESK_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "scope": "read"
        });

        let subdomain = match connection.metadata()["zendesk_subdomain"].as_str() {
            Some(d) => {
                if !ZENDESK_SUBDOMAIN_RE.is_match(d) {
                    Err(anyhow!("Zendesk subdomain format invalid"))?
                }
                d
            }
            None => Err(anyhow!("Zendesk subdomain is missing"))?,
        };

        let url = format!("https://{}.zendesk.com/oauth/tokens", subdomain);

        let req = reqwest::Client::new()
            .post(url)
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

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "Zendesk access tokens do not expire".to_string(),
        ))?
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
