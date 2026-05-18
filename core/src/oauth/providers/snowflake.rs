use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        credential::Credential,
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use tracing::info;

use super::utils::ProviderHttpRequestError;

pub struct SnowflakeConnectionProvider {}

impl SnowflakeConnectionProvider {
    pub fn new() -> Self {
        SnowflakeConnectionProvider {}
    }

    /// Gets the Snowflake credentials (client_id and client_secret) from the related credential
    pub async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Snowflake connection"))?;

        let content = credentials.unseal_encrypted_content()?;

        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Snowflake credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Snowflake credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }

    /// Builds the Snowflake token endpoint URL from the account identifier
    fn get_token_endpoint(snowflake_account: &str) -> String {
        format!(
            "https://{}.snowflakecomputing.com/oauth/token-request",
            snowflake_account.trim()
        )
    }

    /// Builds the Basic auth header for Snowflake OAuth.
    /// RFC 6749 §2.3.1 requires URL-encoding client_id and client_secret before base64-encoding.
    fn build_auth_header(client_id: &str, client_secret: &str) -> String {
        let encoded_id = urlencoding::encode(client_id);
        let encoded_secret = urlencoding::encode(client_secret);
        format!(
            "Basic {}",
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{}:{}", encoded_id, encoded_secret)
            )
        )
    }

    /// Makes a token request to Snowflake and parses the response
    async fn make_token_request(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        params: &[(&str, &str)],
    ) -> Result<serde_json::Value, ProviderError> {
        // Extract account identifier from connection metadata
        let snowflake_account = connection
            .metadata()
            .get("snowflake_account")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!("Missing `snowflake_account` in connection metadata for Snowflake")
            })?;

        // Get Snowflake client_id and client_secret
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let token_endpoint = Self::get_token_endpoint(snowflake_account);
        let auth_header = Self::build_auth_header(&client_id, &client_secret);

        let req = self
            .reqwest_client()
            .post(&token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", &auth_header)
            .form(params);

        execute_request(ConnectionProvider::Snowflake, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))
    }

    /// Parses access token response from Snowflake
    fn parse_token_response(raw_json: &serde_json::Value) -> Result<(String, u64, Option<String>)> {
        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Snowflake"))?
            .to_string();

        let expires_in = raw_json
            .get("expires_in")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| anyhow!("Missing or invalid `expires_in` in response from Snowflake"))?;

        let refresh_token = raw_json["refresh_token"].as_str().map(|t| t.to_string());

        Ok((access_token, expires_in, refresh_token))
    }
}

/// Snowflake OAuth documentation: https://docs.snowflake.com/en/user-guide/oauth-custom
/// Note: Snowflake OAuth requires an account identifier which should be stored in connection metadata.
#[async_trait]
impl Provider for SnowflakeConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Snowflake
    }

    // Snowflake OAuth requests must use the static-IP proxy (default trait impl) — customers
    // with network policies like NETWORK_POLICY = DUST_ONLY allowlist Dust's documented static
    // egress IPs and reject requests coming from the untrusted egress proxy.

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let raw_json = self
            .make_token_request(connection, related_credentials, &params)
            .await?;

        let (access_token, expires_in, refresh_token) = Self::parse_token_response(&raw_json)?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            extra_metadata: None,
            code: code.to_string(),
            access_token,
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token,
            raw_json,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in Snowflake connection"))?,
            Err(e) => Err(e)?,
        };

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
        ];

        let raw_json = self
            .make_token_request(connection, related_credentials, &params)
            .await?;

        let (access_token, expires_in, new_refresh_token) = Self::parse_token_response(&raw_json)?;

        Ok(RefreshResult {
            access_token,
            access_token_expiry: Some(
                utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: new_refresh_token,
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
        match &error {
            ProviderHttpRequestError::RequestFailed {
                status, message, ..
            } if *status == 400 || *status == 401 => {
                let is_revoked = message.contains("invalid_grant")
                    || message.contains("refresh_token")
                    || message.contains("expired");
                info!(message, is_revoked, status, "Snowflake OAuth error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other errors.
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
    use super::*;
    use base64::Engine;

    fn decode_basic_header(header: &str) -> String {
        let encoded = header
            .strip_prefix("Basic ")
            .expect("header must start with 'Basic '");
        String::from_utf8(
            base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .expect("valid base64"),
        )
        .expect("valid UTF-8")
    }

    #[test]
    fn test_build_auth_header_plain_credentials() {
        let header = SnowflakeConnectionProvider::build_auth_header("myclient", "mysecret");
        assert_eq!(decode_basic_header(&header), "myclient:mysecret");
    }

    #[test]
    fn test_build_auth_header_url_encodes_special_chars() {
        // Snowflake-generated secrets often contain '+', '/', '=' from base64 output.
        // RFC 6749 §2.3.1 requires these to be percent-encoded before base64-encoding.
        let header = SnowflakeConnectionProvider::build_auth_header(
            "client+id",
            "secret+with/special=chars",
        );
        assert_eq!(
            decode_basic_header(&header),
            "client%2Bid:secret%2Bwith%2Fspecial%3Dchars"
        );
    }

    #[test]
    fn test_get_token_endpoint_format() {
        let url = SnowflakeConnectionProvider::get_token_endpoint("my-account");
        assert_eq!(
            url,
            "https://my-account.snowflakecomputing.com/oauth/token-request"
        );
    }

    #[test]
    fn test_get_token_endpoint_trims_whitespace() {
        let url = SnowflakeConnectionProvider::get_token_endpoint("  my-account  ");
        assert_eq!(
            url,
            "https://my-account.snowflakecomputing.com/oauth/token-request"
        );
    }

    #[test]
    fn test_parse_token_response_happy_path() {
        let raw = serde_json::json!({
            "access_token": "tok_abc",
            "expires_in": 600,
            "refresh_token": "refresh_xyz"
        });
        let (access, expires, refresh) =
            SnowflakeConnectionProvider::parse_token_response(&raw).unwrap();
        assert_eq!(access, "tok_abc");
        assert_eq!(expires, 600);
        assert_eq!(refresh, Some("refresh_xyz".to_string()));
    }

    #[test]
    fn test_parse_token_response_no_refresh_token() {
        let raw = serde_json::json!({
            "access_token": "tok_abc",
            "expires_in": 3600
        });
        let (_, _, refresh) = SnowflakeConnectionProvider::parse_token_response(&raw).unwrap();
        assert_eq!(refresh, None);
    }

    #[test]
    fn test_parse_token_response_missing_access_token_errors() {
        let raw = serde_json::json!({ "expires_in": 600 });
        assert!(SnowflakeConnectionProvider::parse_token_response(&raw).is_err());
    }

    #[test]
    fn test_parse_token_response_missing_expires_in_errors() {
        let raw = serde_json::json!({ "access_token": "tok" });
        assert!(SnowflakeConnectionProvider::parse_token_response(&raw).is_err());
    }
}
