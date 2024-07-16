use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use serde_json::json;
use std::env;

lazy_static! {
    static ref OAUTH_CONFLUENCE_CLIENT_ID: String = env::var("OAUTH_CONFLUENCE_CLIENT_ID").unwrap();
    static ref OAUTH_CONFLUENCE_CLIENT_SECRET: String =
        env::var("OAUTH_CONFLUENCE_CLIENT_SECRET").unwrap();
}

pub struct ConfluenceConnectionProvider {}

impl ConfluenceConnectionProvider {
    pub fn new() -> Self {
        ConfluenceConnectionProvider {}
    }
}

#[async_trait]
impl Provider for ConfluenceConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Confluence
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult> {
        let body = json!({
            "grant_type": "authorization_code",
            "client_id": *OAUTH_CONFLUENCE_CLIENT_ID,
            "client_secret": *OAUTH_CONFLUENCE_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        });

        let req = reqwest::Client::new()
            .post("https://auth.atlassian.com/oauth/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Confluence, req).await?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Confluence"
            ))?,
        };
        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Confluence"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Confluence"))?,
        };
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `refresh_token` in response from Confluence"
            ))?,
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

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Confluence connection"))?,
            Err(e) => Err(e)?,
        };

        let body = json!({
            "grant_type": "refresh_token",
            "client_id": *OAUTH_CONFLUENCE_CLIENT_ID,
            "client_secret": *OAUTH_CONFLUENCE_CLIENT_SECRET,
            "refresh_token": refresh_token,
        });

        let req = reqwest::Client::new()
            .post("https://auth.atlassian.com/oauth/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Confluence, req).await?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Confluence"
            ))?,
        };
        // expires_in is the number of seconds until the token expires.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!("Invalid `expires_in` in response from Confluence"))?,
            },
            _ => Err(anyhow!("Missing `expires_in` in response from Confluence"))?,
        };
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `refresh_token` in response from Confluence"
            ))?,
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
}
