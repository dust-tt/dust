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
    static ref OAUTH_GOOGLE_DRIVE_CLIENT_ID: String =
        env::var("OAUTH_GOOGLE_DRIVE_CLIENT_ID").unwrap();
    static ref OAUTH_GOOGLE_DRIVE_CLIENT_SECRET: String =
        env::var("OAUTH_GOOGLE_DRIVE_CLIENT_SECRET").unwrap();
}

pub struct GoogleDriveConnectionProvider {}

impl GoogleDriveConnectionProvider {
    pub fn new() -> Self {
        GoogleDriveConnectionProvider {}
    }
}

#[async_trait]
impl Provider for GoogleDriveConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::GoogleDrive
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult> {
        let body = json!({
            "grant_type": "authorization_code",
            "client_id": *OAUTH_GOOGLE_DRIVE_CLIENT_ID,
            "client_secret": *OAUTH_GOOGLE_DRIVE_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        });

        let req = reqwest::Client::new()
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::GoogleDrive, req).await?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Google Drive"
            ))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!(
                    "Invalid `expires_in` in response from Google Drive"
                ))?,
            },
            _ => Err(anyhow!(
                "Missing `expires_in` in response from Google Drive"
            ))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `refresh_token` in response from Google Drive"
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

    // Google Drive does not automatically expire refresh tokens for published apps,
    // unless they have been unused for six months.
    // Acess tokens expire after 1 hour.
    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!(
                "Missing `refresh_token` in Google Drive connection"
            ))?,
            Err(e) => Err(e)?,
        };

        let body = json!({
            "grant_type": "refresh_token",
            "client_id": *OAUTH_GOOGLE_DRIVE_CLIENT_ID,
            "client_secret": *OAUTH_GOOGLE_DRIVE_CLIENT_SECRET,
            "refresh_token": refresh_token,
        });

        let req = reqwest::Client::new()
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::GoogleDrive, req).await?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `access_token` in response from Google Drive"
            ))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => n,
                None => Err(anyhow!(
                    "Invalid `expires_in` in response from Google Drive"
                ))?,
            },
            _ => Err(anyhow!(
                "Missing `expires_in` in response from Google Drive"
            ))?,
        };

        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!(
                "Missing `refresh_token` in response from Google Drive"
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
