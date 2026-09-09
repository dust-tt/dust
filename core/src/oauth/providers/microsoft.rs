use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        credential::{Credential, CredentialProvider},
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use regex::Regex;
use serde_json::json;
use std::env;

use super::utils::ProviderHttpRequestError;

lazy_static! {
    static ref OAUTH_MICROSOFT_CLIENT_ID: String = env::var("OAUTH_MICROSOFT_CLIENT_ID").unwrap();
    static ref OAUTH_MICROSOFT_CLIENT_SECRET: String =
        env::var("OAUTH_MICROSOFT_CLIENT_SECRET").unwrap();
}

/// Decodes the claims (payload) of a JWT without verifying its signature. The token is obtained
/// directly from Microsoft over TLS, so we only read it, never trust it for authorization.
fn decode_jwt_claims(token: &str) -> Option<serde_json::Value> {
    let payload = token.split('.').nth(1)?;
    let decoded = general_purpose::URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&decoded).ok()
}

/// Extracts the authorizing account (email/UPN) from a Microsoft Graph access token JWT. Returns
/// `None` for app-only (service principal) tokens, which carry no user identity.
fn extract_account_from_access_token(access_token: &str) -> Option<String> {
    let claims = decode_jwt_claims(access_token)?;
    for key in ["upn", "preferred_username", "unique_name", "email"] {
        if let Some(serde_json::Value::String(account)) = claims.get(key) {
            if !account.trim().is_empty() {
                return Some(account.clone());
            }
        }
    }
    None
}

pub struct MicrosoftConnectionProvider {}

impl MicrosoftConnectionProvider {
    pub fn new() -> Self {
        MicrosoftConnectionProvider {}
    }

    fn delegated_scopes(&self, connection: &Connection) -> String {
        let metadata = connection.metadata();
        let has_selected_sites = match metadata.get("selected_sites") {
            Some(serde_json::Value::String(s)) => !s.trim().is_empty(),
            Some(serde_json::Value::Array(arr)) => arr.iter().any(|value| match value {
                serde_json::Value::String(s) => !s.trim().is_empty(),
                serde_json::Value::Null => false,
                _ => true,
            }),
            _ => false,
        };

        let mut scopes = vec!["User.Read"];
        if !has_selected_sites {
            scopes.push("Sites.Read.All");
        }
        scopes.push("Files.Read.All");

        scopes.join(" ")
    }

    fn handle_service_principal_credentials(
        &self,
        credential: &Credential,
        connection: &Connection,
    ) -> Result<(String, serde_json::Value), ProviderError> {
        // Credentials is a Microsoft service principal, use client_credentials grant type
        let content = credential.unseal_encrypted_content()?;
        let provider = credential.provider();

        if provider != CredentialProvider::Microsoft {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected Microsoft",
                provider
            ))?;
        }
        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Microsoft credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Microsoft credential"))?;

        Ok((
            format!(
                "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
                connection
                    .metadata()
                    .get("tenant_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing tenant_id in Microsoft connection metadata"))?
            ),
            json!({
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
            }),
        ))
    }
}

#[async_trait]
impl Provider for MicrosoftConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Microsoft
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let (url, body) = match related_credentials {
            Some(credential) => {
                self.handle_service_principal_credentials(&credential, connection)?
            }
            None => (
                "https://login.microsoftonline.com/common/oauth2/v2.0/token".to_string(),
                json!({
                    "grant_type": "authorization_code",
                    "client_id": *OAUTH_MICROSOFT_CLIENT_ID,
                    "client_secret": *OAUTH_MICROSOFT_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "scope": self.delegated_scopes(connection),
                }),
            ),
        };

        let req = self
            .reqwest_client()
            .post(url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::Microsoft, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Microsoft"))?;

        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Microsoft"))?;

        let refresh_token = raw_json["refresh_token"].as_str();

        // Surface the authorizing Microsoft account (email/UPN) so admins can verify which
        // identity backs the connection. App-only (service principal) tokens carry no user
        // identity, so `connected_account` is simply absent in that case.
        let extra_metadata = extract_account_from_access_token(access_token).map(|account| {
            serde_json::Map::from_iter([(
                "connected_account".to_string(),
                serde_json::Value::String(account),
            )])
        });

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: refresh_token.map(|s| s.to_string()),
            raw_json,
            extra_metadata,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let (url, body) = match related_credentials {
            Some(credential) => {
                self.handle_service_principal_credentials(&credential, connection)?
            }
            None => {
                let refresh_token = connection
                    .unseal_refresh_token()?
                    .ok_or_else(|| anyhow!("Missing `refresh_token` in Microsoft connection"))?;

                (
                    "https://login.microsoftonline.com/common/oauth2/v2.0/token".to_string(),
                    json!({
                        "grant_type": "refresh_token",
                        "client_id": *OAUTH_MICROSOFT_CLIENT_ID,
                        "client_secret": *OAUTH_MICROSOFT_CLIENT_SECRET,
                        "refresh_token": refresh_token,
                        "scope": self.delegated_scopes(connection),
                    }),
                )
            }
        };

        let req = self
            .reqwest_client()
            .post(url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::Microsoft, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Microsoft"))?;

        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Microsoft"))?;

        let refresh_token = raw_json["refresh_token"].as_str();

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: refresh_token.map(|s| s.to_string()),
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

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        let app_disabled_regex = Regex::new(r"Application.*is disabled").unwrap();

        match &error {
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 400 => {
                if message.contains("invalid_grant")
                    && message.contains(
                        "The user or administrator has not consented to use the application",
                    )
                {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other 400 errors.
                    self.default_handle_provider_request_error(error)
                }
            }
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 403 => {
                if app_disabled_regex.is_match(message) {
                    ProviderError::TokenRevokedError
                } else {
                    self.default_handle_provider_request_error(error)
                }
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
    use super::extract_account_from_access_token;
    use base64::{engine::general_purpose, Engine as _};
    use serde_json::json;

    fn make_jwt(claims: serde_json::Value) -> String {
        let header = general_purpose::URL_SAFE_NO_PAD.encode(r#"{"alg":"none","typ":"JWT"}"#);
        let payload = general_purpose::URL_SAFE_NO_PAD.encode(claims.to_string());
        format!("{}.{}.signature", header, payload)
    }

    #[test]
    fn extracts_upn_from_delegated_token() {
        let token = make_jwt(json!({ "upn": "etienne@manageris.com" }));
        assert_eq!(
            extract_account_from_access_token(&token),
            Some("etienne@manageris.com".to_string())
        );
    }

    #[test]
    fn falls_back_to_preferred_username_then_email() {
        let token = make_jwt(json!({ "preferred_username": "generic@manageris.com" }));
        assert_eq!(
            extract_account_from_access_token(&token),
            Some("generic@manageris.com".to_string())
        );

        let token = make_jwt(json!({ "email": "svc@manageris.com" }));
        assert_eq!(
            extract_account_from_access_token(&token),
            Some("svc@manageris.com".to_string())
        );
    }

    #[test]
    fn prefers_upn_over_other_claims() {
        let token = make_jwt(json!({
            "upn": "primary@manageris.com",
            "preferred_username": "secondary@manageris.com",
            "email": "tertiary@manageris.com",
        }));
        assert_eq!(
            extract_account_from_access_token(&token),
            Some("primary@manageris.com".to_string())
        );
    }

    #[test]
    fn returns_none_for_app_only_token_without_user_claims() {
        // Service principal (client_credentials) tokens carry no user identity.
        let token = make_jwt(json!({ "roles": ["Sites.Read.All"], "tid": "tenant-123" }));
        assert_eq!(extract_account_from_access_token(&token), None);
    }

    #[test]
    fn returns_none_for_malformed_token() {
        assert_eq!(extract_account_from_access_token("not-a-jwt"), None);
        assert_eq!(extract_account_from_access_token(""), None);
    }

    #[test]
    fn returns_none_for_opaque_or_non_jwt_token_formats() {
        // Graph tokens are sometimes opaque/encrypted rather than a decodable JWT: extraction must
        // degrade to `None`, never error, so finalize keeps working.
        // Segment count of a JWT but the payload is not valid base64url.
        assert_eq!(extract_account_from_access_token("aaa.!!!.bbb"), None);
        // Valid base64url payload that is not JSON.
        let not_json = general_purpose::URL_SAFE_NO_PAD.encode("not json");
        assert_eq!(
            extract_account_from_access_token(&format!("aaa.{}.bbb", not_json)),
            None
        );
        // Valid JSON payload that is not an object (so `.get(...)` yields nothing).
        let json_array = general_purpose::URL_SAFE_NO_PAD.encode("[1,2,3]");
        assert_eq!(
            extract_account_from_access_token(&format!("aaa.{}.bbb", json_array)),
            None
        );
    }

    #[test]
    fn ignores_blank_account_claims() {
        let token = make_jwt(json!({ "upn": "   ", "email": "real@manageris.com" }));
        assert_eq!(
            extract_account_from_access_token(&token),
            Some("real@manageris.com".to_string())
        );
    }
}
