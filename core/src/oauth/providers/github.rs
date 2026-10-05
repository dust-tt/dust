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

/// Composite finalize `code` from front: `gh_app_install:{installation_id}:{oauth_code}`.
const GITHUB_APP_FINALIZE_CODE_PREFIX: &str = "gh_app_install";

fn is_github_installation_id(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some('1'..='9') => chars.all(|c| c.is_ascii_digit()) && value.len() <= 20,
        _ => false,
    }
}

/// Parses the App-flow finalize code into `(installation_id, user_oauth_code)`.
/// A bare installation id is rejected: it is not proof the caller installed it.
fn parse_github_app_finalize_code(code: &str) -> Result<(String, String), ProviderError> {
    let rest = match code
        .strip_prefix(GITHUB_APP_FINALIZE_CODE_PREFIX)
        .and_then(|s| s.strip_prefix(':'))
    {
        Some(rest) => rest,
        None => return Err(ProviderError::TokenRevokedError),
    };
    let (installation_id, oauth_code) = match rest.split_once(':') {
        Some((installation_id, oauth_code)) => (installation_id, oauth_code),
        None => return Err(ProviderError::TokenRevokedError),
    };
    if !is_github_installation_id(installation_id) || oauth_code.is_empty() {
        return Err(ProviderError::TokenRevokedError);
    }
    Ok((installation_id.to_string(), oauth_code.to_string()))
}

/// Authorization code stored on the connection: the composite finalize code
/// (so a duplicate callback is idempotent) or a bare installation id from
/// connections finalized before that composite existed.
fn installation_id_from_stored_authorization_code(code: &str) -> Result<String, ProviderError> {
    if is_github_installation_id(code) {
        return Ok(code.to_string());
    }
    parse_github_app_finalize_code(code).map(|(installation_id, _)| installation_id)
}

lazy_static! {
    static ref OAUTH_GITHUB_APP_CLIENT_ID: String =
        std::env::var("OAUTH_GITHUB_APP_CLIENT_ID").unwrap();
    static ref OAUTH_GITHUB_APP_ENCODING_KEY: EncodingKey = {
        let path = std::env::var("OAUTH_GITHUB_APP_PRIVATE_KEY_PATH").unwrap();
        let key = std::fs::read_to_string(path).unwrap();
        EncodingKey::from_rsa_pem(key.as_bytes()).unwrap()
    };
    static ref OAUTH_GITHUB_APP_CLIENT_SECRET: String =
        std::env::var("OAUTH_GITHUB_APP_CLIENT_SECRET").unwrap();
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

    fn github_app_oauth_credentials(
        app_type: GithubUseCase,
    ) -> Result<(&'static str, &'static str), ProviderError> {
        match app_type {
            GithubUseCase::Connection => Ok((
                OAUTH_GITHUB_APP_CLIENT_ID.as_str(),
                OAUTH_GITHUB_APP_CLIENT_SECRET.as_str(),
            )),
            GithubUseCase::PlatformActions => Ok((
                OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID.as_str(),
                OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_SECRET.as_str(),
            )),
            GithubUseCase::PersonalActions | GithubUseCase::Webhooks => {
                Err(ProviderError::InternalError(anyhow!(
                    "github_app_oauth_credentials only supports GitHub App use cases"
                )))
            }
        }
    }

    async fn exchange_github_app_user_token(
        &self,
        app_type: GithubUseCase,
        oauth_code: &str,
        redirect_uri: &str,
    ) -> Result<String, ProviderError> {
        let (client_id, client_secret) = Self::github_app_oauth_credentials(app_type)?;

        let req = self
            .reqwest_client()
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .header("User-Agent", "dust/oauth")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .form(&[
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("code", oauth_code),
                ("redirect_uri", redirect_uri),
            ]);

        let raw_json = execute_request(ConnectionProvider::Github, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        if raw_json.get("error").is_some() {
            return Err(ProviderError::TokenRevokedError);
        }

        match raw_json["access_token"].as_str() {
            Some(token) if !token.is_empty() => Ok(token.to_string()),
            _ => Err(ProviderError::TokenRevokedError),
        }
    }

    /// Confirms the user token can access this installation *before* minting an
    /// App installation token. Uses GET /user/installations/{id}/repositories
    /// so a foreign id is indistinguishable from a missing one (both 404).
    async fn verify_user_can_access_installation(
        &self,
        user_token: &str,
        installation_id: &str,
    ) -> Result<(), ProviderError> {
        if !is_github_installation_id(installation_id) {
            return Err(ProviderError::TokenRevokedError);
        }

        let req = self
            .reqwest_client()
            .get(format!(
                "https://api.github.com/user/installations/{}/repositories?per_page=1",
                installation_id
            ))
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", format!("Bearer {}", user_token))
            .header("User-Agent", "dust/oauth")
            .header("X-GitHub-Api-Version", "2022-11-28");

        match execute_request(ConnectionProvider::Github, req).await {
            Ok(_) => Ok(()),
            Err(e) => Err(self.handle_provider_request_error(e)),
        }
    }

    async fn refresh_installation_token(
        &self,
        app_type: GithubUseCase,
        code: &str,
    ) -> Result<(String, u64, serde_json::Value), ProviderError> {
        if !is_github_installation_id(code) {
            return Err(ProviderError::TokenRevokedError);
        }

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

    /// @cc [owner:sflory,label:security] github-app-install-ownership
    /// GitHub App finalize MUST exchange the user OAuth `code` and verify the
    /// installation is accessible to that user before minting an installation
    /// token. A caller-supplied installation id MUST NOT be enough to call
    /// POST /app/installations/{id}/access_tokens.
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

        let (installation_id, oauth_code) = parse_github_app_finalize_code(code)?;
        let user_token = self
            .exchange_github_app_user_token(app_type.clone(), &oauth_code, redirect_uri)
            .await?;
        self.verify_user_can_access_installation(&user_token, &installation_id)
            .await?;

        let (token, expiry, raw_json) = self
            .refresh_installation_token(app_type, &installation_id)
            .await?;

        // Persist the incoming composite code so a second finalize (React
        // StrictMode, popup retry) matches `is_already_finalized`. Refresh
        // extracts the installation id from it.
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

        let stored_code = match connection.unseal_authorization_code()? {
            Some(code) => code,
            None => Err(anyhow!("Missing installation_id in connection"))?,
        };
        let installation_id = installation_id_from_stored_authorization_code(&stored_code)?;

        let (token, expiry, raw_json) = self
            .refresh_installation_token(app_type, &installation_id)
            .await?;

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
                map.remove("token"); // GitHub App installation token
                map.remove("access_token"); // OAuth app access token
                map.remove("refresh_token"); // OAuth app refresh token
                map.remove("expires_in"); // Token expiry — stripped for consistency with other providers
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };
        Ok(raw_json)
    }

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        match &error {
            ProviderHttpRequestError::RequestFailed { status, .. }
                if *status == 401 || *status == 403 || *status == 404 =>
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

#[cfg(test)]
mod tests {
    use super::{
        installation_id_from_stored_authorization_code, is_github_installation_id,
        parse_github_app_finalize_code, GithubConnectionProvider,
    };
    use crate::oauth::{
        connection::{ConnectionProvider, Provider, ProviderError},
        providers::utils::ProviderHttpRequestError,
    };

    #[test]
    fn rejects_bare_installation_id_as_finalize_code() {
        assert!(matches!(
            parse_github_app_finalize_code("12345"),
            Err(ProviderError::TokenRevokedError)
        ));
        assert!(matches!(
            parse_github_app_finalize_code("gh_app_install:12345"),
            Err(ProviderError::TokenRevokedError)
        ));
        assert!(matches!(
            parse_github_app_finalize_code("gh_app_install:0123:oauth-code"),
            Err(ProviderError::TokenRevokedError)
        ));
        assert!(matches!(
            parse_github_app_finalize_code("gh_app_install:../1:oauth-code"),
            Err(ProviderError::TokenRevokedError)
        ));
    }

    #[test]
    fn parses_installation_id_and_user_oauth_code() {
        let (installation_id, oauth_code) =
            parse_github_app_finalize_code("gh_app_install:12345:user-oauth-code")
                .expect("valid App finalize code");
        assert_eq!(installation_id, "12345");
        assert_eq!(oauth_code, "user-oauth-code");
    }

    #[test]
    fn oauth_code_may_contain_colons() {
        let (installation_id, oauth_code) =
            parse_github_app_finalize_code("gh_app_install:99:abc:def")
                .expect("oauth code with colon");
        assert_eq!(installation_id, "99");
        assert_eq!(oauth_code, "abc:def");
    }

    #[test]
    fn stored_authorization_code_yields_installation_id() {
        assert_eq!(
            installation_id_from_stored_authorization_code("12345").unwrap(),
            "12345"
        );
        assert_eq!(
            installation_id_from_stored_authorization_code("gh_app_install:12345:user-oauth-code")
                .unwrap(),
            "12345"
        );
        assert!(matches!(
            installation_id_from_stored_authorization_code("not-an-id"),
            Err(ProviderError::TokenRevokedError)
        ));
    }

    #[test]
    fn installation_id_must_be_a_positive_integer() {
        assert!(is_github_installation_id("1"));
        assert!(is_github_installation_id("12345"));
        assert!(!is_github_installation_id("0"));
        assert!(!is_github_installation_id("0123"));
        assert!(!is_github_installation_id("12a"));
        assert!(!is_github_installation_id(""));
    }

    #[test]
    fn github_auth_failures_are_token_revoked() {
        let provider = GithubConnectionProvider::new();
        for status in [401, 403, 404] {
            let error =
                provider.handle_provider_request_error(ProviderHttpRequestError::RequestFailed {
                    provider: ConnectionProvider::Github,
                    status,
                    message: "not found".to_string(),
                });
            assert!(matches!(error, ProviderError::TokenRevokedError));
        }
    }
}
