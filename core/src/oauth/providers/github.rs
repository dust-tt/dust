use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        },
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

use super::utils::ProviderHttpRequestError;

lazy_static! {
    static ref OAUTH_GITHUB_APP_CLIENT_ID: String =
        std::env::var("OAUTH_GITHUB_APP_CLIENT_ID").unwrap();
    static ref OAUTH_GITHUB_APP_ENCODING_KEY: EncodingKey = {
        let path = std::env::var("OAUTH_GITHUB_APP_PRIVATE_KEY_PATH").unwrap();
        let key = std::fs::read_to_string(path).unwrap();
        EncodingKey::from_rsa_pem(key.as_bytes()).unwrap()
    };
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JWTPayload {
    iat: u64,
    exp: u64,
    iss: String,
}

pub struct GithubConnectionProvider {}

impl GithubConnectionProvider {
    pub fn new() -> Self {
        GithubConnectionProvider {}
    }

    // See https://docs.github.com/en
    //             /apps/creating-github-apps/authenticating-with-a-github-app
    //             /generating-a-json-web-token-jwt-for-a-github-app
    fn jwt(&self) -> Result<String> {
        let header = Header::new(Algorithm::RS256);
        let payload = JWTPayload {
            iat: utils::now_secs() - 60,
            exp: utils::now_secs() + 3 * 60,
            iss: OAUTH_GITHUB_APP_CLIENT_ID.clone(),
        };

        let token = encode(&header, &payload, &OAUTH_GITHUB_APP_ENCODING_KEY)?;

        Ok(token)
    }

    async fn refresh_token(
        &self,
        code: &str,
    ) -> Result<(String, u64, serde_json::Value), ProviderError> {
        // https://github.com/octokit/auth-app.js/blob/main/src/get-installation-authentication.ts
        let req = reqwest::Client::new()
            .post(format!(
                "https://api.github.com/app/installations/{}/access_tokens",
                code
            ))
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", format!("Bearer {}", self.jwt()?))
            .header("User-Agent", "dust/oauth")
            .header("X-GitHub-Api-Version", "2022-11-28");

        let raw_json = execute_request(ConnectionProvider::Github, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let token = match raw_json["token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `token` in response from Github"))?,
        };
        // expires_at has the format "2024-07-13T17:07:43Z"
        let expires_at = match raw_json["expires_at"].as_str() {
            Some(expires_at) => expires_at,
            None => Err(anyhow!("Missing `expires_at` in response from Github"))?,
        };

        let date: DateTime<Utc> = match expires_at.parse() {
            Ok(date) => date,
            Err(_) => Err(anyhow!("Invalid `expires_at` in response from Github"))?,
        };
        let expiry = date.timestamp_millis();

        // We store the installation_id on the raw_json as this is convenient to have it accessible
        // through the scrubbed_raw_json.
        let mut raw_json = raw_json.clone();
        raw_json["installation_id"] = serde_json::Value::String(code.to_string());

        Ok((token.to_string(), expiry as u64, raw_json))
    }
}

#[async_trait]
impl Provider for GithubConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Github
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        // `code` is the installation_id returned by Github.
        let (token, expiry, raw_json) = self.refresh_token(code).await?;

        // We store the installation_id as `code` which will be used to refresh tokens.
        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: token.to_string(),
            access_token_expiry: Some(expiry),
            refresh_token: None,
            raw_json,
        })
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult, ProviderError> {
        // `code` is the installation_id returned by Github.
        let code = match connection.unseal_authorization_code()? {
            Some(code) => code,
            None => Err(anyhow!("Missing installation_id in connection"))?,
        };

        let (token, expiry, raw_json) = self.refresh_token(&code).await?;

        Ok(RefreshResult {
            access_token: token.to_string(),
            access_token_expiry: Some(expiry),
            refresh_token: None,
            // `raw_json` at refresh is an updated version of the full object.
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("token");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };
        Ok(raw_json)
    }

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        match &error {
            ProviderHttpRequestError::RequestFailed { status, .. } if *status == 403 => {
                ProviderError::TokenRevokedError
            }
            _ => {
                // Call the default implementation for other cases.
                self.default_handle_provider_request_error(error)
            }
        }
    }
}
