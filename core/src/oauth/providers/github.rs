use crate::{
    oauth::connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, RefreshResult,
        PROVIDER_TIMEOUT_SECONDS,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hyper::body::Buf;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::io::prelude::*;
use std::time::Duration;
use tokio::time::timeout;

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

    async fn refresh_token(&self, code: &str) -> Result<(String, u64, serde_json::Value)> {
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

        let now = utils::now_secs();

        let res = match timeout(Duration::new(PROVIDER_TIMEOUT_SECONDS, 0), req.send()).await {
            Ok(Ok(res)) => res,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!("Timeout sending request to Github"))?,
        };

        if !res.status().is_success() {
            Err(anyhow!(
                "Error generating access token with Github: status={}",
                res.status().as_u16()
            ))?;
        }

        let body = match timeout(
            Duration::new(PROVIDER_TIMEOUT_SECONDS - (utils::now_secs() - now), 0),
            res.bytes(),
        )
        .await
        {
            Ok(Ok(body)) => body,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!("Timeout reading response from Github"))?,
        };

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let raw_json: serde_json::Value = serde_json::from_slice(c)?;

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
        _redirect_uri: &str,
    ) -> Result<FinalizeResult> {
        // `code` is the installation_id returned by Github.
        let (token, expiry, raw_json) = self.refresh_token(code).await?;

        // We store the installation_id as `code` which will be used to refresh tokens.
        Ok(FinalizeResult {
            code: code.to_string(),
            access_token: token.to_string(),
            access_token_expiry: Some(expiry),
            refresh_token: None,
            raw_json,
        })
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult> {
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
}
