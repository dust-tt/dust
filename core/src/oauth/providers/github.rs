use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        },
        credential::Credential,
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
    static ref OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID: String =
        std::env::var("OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID").unwrap();
    static ref OAUTH_GITHUB_APP_PLATFORM_ACTIONS_ENCODING_KEY: EncodingKey = {
        let path = std::env::var("OAUTH_GITHUB_APP_PLATFORM_ACTIONS_PRIVATE_KEY_PATH").unwrap();
        let key = std::fs::read_to_string(path).unwrap();
        EncodingKey::from_rsa_pem(key.as_bytes()).unwrap()
    };
    static ref OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_SECRET: String =
        std::env::var("OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_SECRET").unwrap();
    static ref OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID: String =
        std::env::var("OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID").unwrap();
    static ref OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_SECRET: String =
        std::env::var("OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_SECRET").unwrap();
}

/// We support multiple Github apps for different use cases:
/// - `connection`: Default app for data source connections (GitHub App)
/// - `platform_actions`: App for agent actions (GitHub App)
/// - `personal_actions`: OAuth flow for personal user access (OAuth App)
/// - `webhooks`: OAuth flow for webhook management (OAuth App)
#[derive(Debug, PartialEq, Clone)]
pub enum GithubUseCase {
    Connection,
    PlatformActions,
    PersonalActions,
    Webhooks,
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
    fn jwt(&self, app_type: GithubUseCase) -> Result<String> {
        let header = Header::new(Algorithm::RS256);

        match app_type {
            GithubUseCase::Connection => {
                let payload = JWTPayload {
                    iat: utils::now_secs() - 60,
                    exp: utils::now_secs() + 3 * 60,
                    iss: OAUTH_GITHUB_APP_CLIENT_ID.clone(),
                };

                let token = encode(&header, &payload, &OAUTH_GITHUB_APP_ENCODING_KEY)?;

                Ok(token)
            }
            GithubUseCase::PlatformActions => {
                let payload = JWTPayload {
                    iat: utils::now_secs() - 60,
                    exp: utils::now_secs() + 3 * 60,
                    iss: OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID.clone(),
                };

                let token = encode(
                    &header,
                    &payload,
                    &OAUTH_GITHUB_APP_PLATFORM_ACTIONS_ENCODING_KEY,
                )?;

                Ok(token)
            }
            GithubUseCase::PersonalActions | GithubUseCase::Webhooks => {
                Err(anyhow!("JWT not required for OAuth flow"))?
            }
        }
    }

    async fn refresh_installation_token(
        &self,
        app_type: GithubUseCase,
        code: &str,
    ) -> Result<(String, u64, serde_json::Value), ProviderError> {
        // https://github.com/octokit/auth-app.js/blob/main/src/get-installation-authentication.ts
        let req = self
            .reqwest_client()
            .post(format!(
                "https://api.github.com/app/installations/{}/access_tokens",
                code
            ))
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", format!("Bearer {}", self.jwt(app_type)?))
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

    async fn refresh_oauth_token(
        &self,
        refresh_token: &str,
        app_type: GithubUseCase,
    ) -> Result<RefreshResult, ProviderError> {
        let (client_id, client_secret) = match app_type {
            GithubUseCase::PersonalActions => (
                OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID.as_str(),
                OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_SECRET.as_str(),
            ),
            GithubUseCase::Webhooks => (
                OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID.as_str(),
                OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_SECRET.as_str(),
            ),
            _ => Err(anyhow!(
                "refresh_oauth_token only supports PersonalActions and Webhooks use cases"
            ))?,
        };

        let req = self
            .reqwest_client()
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .header("User-Agent", "dust/oauth")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .form(&[
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
            ]);

        let raw_json = execute_request(ConnectionProvider::Github, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Github"))?,
        };
        let refresh_token = match raw_json["refresh_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `refresh_token` in response from Github"))?,
        };

        let expires_in = raw_json["expires_in"].as_u64().unwrap_or(28800); // Default 8 hours
        let expiry_timestamp = (utils::now_secs() + expires_in) * 1000;

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(expiry_timestamp),
            refresh_token: Some(refresh_token.to_string()),
            raw_json,
        })
    }

    async fn finalize_oauth_flow(
        &self,
        code: &str,
        redirect_uri: &str,
        app_type: GithubUseCase,
    ) -> Result<FinalizeResult, ProviderError> {
        let (client_id, client_secret) = match app_type {
            GithubUseCase::PersonalActions => (
                OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID.as_str(),
                OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_SECRET.as_str(),
            ),
            GithubUseCase::Webhooks => (
                OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID.as_str(),
                OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_SECRET.as_str(),
            ),
            _ => Err(anyhow!(
                "finalize_oauth_flow only supports PersonalActions and Webhooks use cases"
            ))?,
        };

        let req = self
            .reqwest_client()
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "dust/oauth")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .form(&[
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("code", code),
                ("redirect_uri", redirect_uri),
            ]);

        let raw_json = execute_request(ConnectionProvider::Github, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Github"))?,
        };

        // Refresh tokens are optional for GitHub OAuth Apps
        // They're only provided if the app is configured for expiring tokens
        let refresh_token = raw_json["refresh_token"].as_str();

        let (access_token_expiry, refresh_token_value) = if let Some(rt) = refresh_token {
            // Token expires, use expiration from response
            let expires_in = raw_json["expires_in"].as_u64().unwrap_or(28800);
            let expiry_timestamp = (utils::now_secs() + expires_in) * 1000;
            (Some(expiry_timestamp), Some(rt.to_string()))
        } else {
            // No refresh token means non-expiring token (classic OAuth App)
            (None, None)
        };

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: access_token.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token: refresh_token_value,
            raw_json,
            extra_metadata: None,
        })
    }
}

#[async_trait]
impl Provider for GithubConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Github
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let app_type = match connection.metadata()["use_case"].as_str() {
            Some(use_case) => match use_case {
                "connection" => GithubUseCase::Connection,
                "platform_actions" => GithubUseCase::PlatformActions,
                "personal_actions" => GithubUseCase::PersonalActions,
                "webhooks" => GithubUseCase::Webhooks,
                _ => Err(anyhow!("Github use_case format invalid"))?,
            },
            None => Err(anyhow!("Github use_case missing"))?,
        };

        if app_type == GithubUseCase::PersonalActions || app_type == GithubUseCase::Webhooks {
            return self.finalize_oauth_flow(code, redirect_uri, app_type).await;
        }

        // `code` is the installation_id returned by Github for GitHub App installations
        // This includes Connection and PlatformActions
        let (token, expiry, raw_json) = self.refresh_installation_token(app_type, code).await?;

        // We store the installation_id as `code` which will be used to refresh tokens.
        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: token.to_string(),
            access_token_expiry: Some(expiry),
            refresh_token: None,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let app_type = match connection.metadata()["use_case"].as_str() {
            Some(use_case) => match use_case {
                "connection" => GithubUseCase::Connection,
                "platform_actions" => GithubUseCase::PlatformActions,
                "personal_actions" => GithubUseCase::PersonalActions,
                "webhooks" => GithubUseCase::Webhooks,
                _ => Err(anyhow!("Github use_case format invalid"))?,
            },
            None => Err(anyhow!("Github use_case missing"))?,
        };

        if app_type == GithubUseCase::PersonalActions || app_type == GithubUseCase::Webhooks {
            let refresh_token = connection
                .unseal_refresh_token()?
                .ok_or(ProviderError::TokenRevokedError)?;

            return self.refresh_oauth_token(&refresh_token, app_type).await;
        }

        let code = match connection.unseal_authorization_code()? {
            Some(code) => code,
            None => Err(anyhow!("Missing installation_id in connection"))?,
        };

        let (token, expiry, raw_json) = self.refresh_installation_token(app_type, &code).await?;

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
            ProviderHttpRequestError::RequestFailed { status, .. }
                if *status == 403 || *status == 404 =>
            {
                ProviderError::TokenRevokedError
            }
            _ => {
                // Call the default implementation for other cases.
                self.default_handle_provider_request_error(error)
            }
        }
    }
}
