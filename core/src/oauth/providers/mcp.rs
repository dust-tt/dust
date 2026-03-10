use crate::{
    http::proxy_client::create_untrusted_egress_client_builder,
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
use serde::Deserialize;
use tracing::{error, info};

use super::utils::ProviderHttpRequestError;

/// Default expiry (1 hour) for tokens without `expires_in` that have a refresh_token.
/// When a server returns a refresh_token but no expires_in, the access token likely expires
/// server-side. This default ensures proactive refresh instead of waiting for a 401.
const DEFAULT_TOKEN_EXPIRY_SECONDS: u64 = 3600;

/// Compute the access_token_expiry timestamp in milliseconds.
/// Uses `saturating_sub` to avoid underflow if `expires_in` < `PROVIDER_TIMEOUT_SECONDS`.
fn compute_expiry(expires_in: u64) -> u64 {
    utils::now() + expires_in.saturating_sub(PROVIDER_TIMEOUT_SECONDS) * 1000
}

/// Compute the access_token_expiry, defaulting to `DEFAULT_TOKEN_EXPIRY_SECONDS` when
/// `expires_in` is missing but a refresh token is present (meaning the token likely expires).
fn compute_access_token_expiry(expires_in: Option<u64>, has_refresh_token: bool) -> Option<u64> {
    match expires_in {
        Some(ei) => Some(compute_expiry(ei)),
        None if has_refresh_token => {
            info!(
                "No expires_in but refresh_token present; defaulting to {}s expiry",
                DEFAULT_TOKEN_EXPIRY_SECONDS
            );
            Some(compute_expiry(DEFAULT_TOKEN_EXPIRY_SECONDS))
        }
        None => None,
    }
}

#[derive(Debug, Deserialize)]
pub struct MCPConnectionMetadata {
    pub client_id: String,
    pub token_endpoint: String,
    pub authorization_endpoint: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub scope: Option<String>,
    pub resource: Option<String>,
    pub token_endpoint_auth_method: Option<String>,
}

pub struct MCPConnectionProvider {}

impl MCPConnectionProvider {
    pub fn new() -> Self {
        MCPConnectionProvider {}
    }

    fn build_basic_auth_header(client_id: &str, client_secret: &str) -> String {
        format!(
            "Basic {}",
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{}:{}", client_id, client_secret)
            )
        )
    }

    pub async fn get_credentials(
        credentials: Option<Credential>,
    ) -> Result<(String, Option<String>)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for MCP connection"))?;

        let content = credentials.unseal_encrypted_content()?;
        let provider = credentials.provider();

        // Fetch credential
        if provider != CredentialProvider::Mcp && provider != CredentialProvider::McpStatic {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected MCP or McpStatic",
                provider
            ));
        }

        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in MCP credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok((client_id.to_string(), client_secret))
    }

    /// Execute a refresh token request against the token endpoint.
    /// Extracted to allow retrying without the `resource` parameter on failure.
    async fn execute_refresh_request(
        &self,
        token_endpoint: &str,
        refresh_token: &str,
        client_id: &str,
        client_secret: Option<&str>,
        use_basic_auth: bool,
        resource: Option<&str>,
    ) -> Result<serde_json::Value, ProviderHttpRequestError> {
        let grant_type = "refresh_token";

        let mut form_data = vec![("grant_type", grant_type), ("refresh_token", refresh_token)];

        if !use_basic_auth {
            form_data.push(("client_id", client_id));

            if let Some(secret) = client_secret {
                form_data.push(("client_secret", secret));
            }
        }

        // Include resource parameter per RFC 8707 if provided.
        if let Some(resource) = resource {
            form_data.push(("resource", resource));
        }

        let mut req = self
            .reqwest_client()
            .post(token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

        if use_basic_auth {
            let auth_header = Self::build_basic_auth_header(
                client_id,
                client_secret.ok_or(ProviderHttpRequestError::InvalidResponse(anyhow!(
                    "client_secret required for basic auth"
                )))?,
            );
            req = req.header("Authorization", auth_header);
        }

        execute_request(ConnectionProvider::Mcp, req).await
    }
}

#[async_trait]
impl Provider for MCPConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Mcp
    }

    fn reqwest_client(&self) -> reqwest::Client {
        // MCP provider makes requests to user-provided URLs, so we use the untrusted egress proxy.
        match create_untrusted_egress_client_builder().build() {
            Ok(client) => client,
            Err(e) => {
                error!(error = ?e, "Failed to create client with untrusted egress proxy");
                reqwest::Client::new()
            }
        }
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let metadata: MCPConnectionMetadata = serde_json::from_value(connection.metadata().clone())
            .map_err(|e| ProviderError::InvalidMetadataError(e.to_string()))?;

        let grant_type = "authorization_code";

        let use_basic_auth = matches!(
            metadata.token_endpoint_auth_method.as_deref(),
            Some("client_secret_basic")
        ) && client_secret.is_some();

        let mut form_data = vec![
            ("grant_type", grant_type),
            ("code", code),
            ("code_verifier", &metadata.code_verifier),
            ("redirect_uri", redirect_uri),
        ];

        if !use_basic_auth {
            form_data.push(("client_id", &client_id));

            // Only include client_secret if it's provided
            if let Some(ref secret) = client_secret {
                form_data.push(("client_secret", secret));
            }
        }

        // Include resource parameter per RFC 8707 if available.
        if let Some(ref resource) = metadata.resource {
            form_data.push(("resource", resource));
        }

        let mut req = self
            .reqwest_client()
            .post(metadata.token_endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

        if use_basic_auth {
            let auth_header = Self::build_basic_auth_header(
                &client_id,
                client_secret
                    .as_ref()
                    .ok_or_else(|| anyhow!("client_secret required for basic auth"))?,
            );

            req = req.header("Authorization", auth_header);
        }

        let raw_json = execute_request(ConnectionProvider::Mcp, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from MCP"))?,
        };

        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => Some(n),
                None => Err(anyhow!("Invalid `expires_in` in response from MCP"))?,
            },
            _ => {
                info!("Missing `expires_in` in response from MCP. It's valid to not return one.");
                None
            }
        };

        // Some MCP servers do not return a refresh token when finalizing an access token.
        let refresh_token = raw_json["refresh_token"].as_str().map(ToString::to_string);

        // When no expires_in but a refresh_token is present, the access token likely
        // expires server-side. Default to 1 hour to ensure proactive refresh.
        let access_token_expiry = compute_access_token_expiry(expires_in, refresh_token.is_some());

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.unseal_refresh_token() {
            Ok(Some(token)) => token,
            Ok(None) => Err(anyhow!("Missing `refresh_token` in MCP connection"))?,
            Err(e) => Err(e)?,
        };

        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        let metadata: MCPConnectionMetadata = serde_json::from_value(connection.metadata().clone())
            .map_err(|e| ProviderError::InvalidMetadataError(e.to_string()))?;

        let use_basic_auth = matches!(
            metadata.token_endpoint_auth_method.as_deref(),
            Some("client_secret_basic")
        ) && client_secret.is_some();

        // Try with resource parameter first. If the auth server rejects with 400
        // (many don't support RFC 8707), retry without resource. Per RFC 8707 §5 the auth
        // server SHOULD remember the resource from the original grant, so omitting it in
        // refresh is valid.
        let raw_json = match self
            .execute_refresh_request(
                &metadata.token_endpoint,
                &refresh_token,
                &client_id,
                client_secret.as_deref(),
                use_basic_auth,
                metadata.resource.as_deref(),
            )
            .await
        {
            Ok(json) => json,
            Err(ProviderHttpRequestError::RequestFailed { status, .. })
                if status == 400 && metadata.resource.is_some() =>
            {
                info!("MCP refresh failed with resource parameter, retrying without it");
                self.execute_refresh_request(
                    &metadata.token_endpoint,
                    &refresh_token,
                    &client_id,
                    client_secret.as_deref(),
                    use_basic_auth,
                    None,
                )
                .await
                .map_err(|e| self.handle_provider_request_error(e))?
            }
            Err(e) => return Err(self.handle_provider_request_error(e)),
        };

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from MCP"))?,
        };

        // expires_in is RECOMMENDED per OAuth 2.1, not REQUIRED.
        // Handle missing expires_in the same way as finalize.
        let expires_in = match raw_json.get("expires_in") {
            Some(serde_json::Value::Number(n)) => match n.as_u64() {
                Some(n) => Some(n),
                None => Err(anyhow!("Invalid `expires_in` in response from MCP"))?,
            },
            _ => {
                info!("Missing `expires_in` in refresh response from MCP.");
                None
            }
        };

        // The scope should be available in the response, if not it could be available in the connection metadata.
        let scope = match raw_json["scope"].as_str() {
            Some(scope) => Some(scope.to_string()),
            None => metadata.scope,
        };

        // token_type is often omitted in refresh responses since it doesn't change.
        if raw_json
            .get("token_type")
            .and_then(|v| v.as_str())
            .is_none()
        {
            info!("Missing `token_type` in refresh response from MCP.");
        }

        let existing_raw_json = connection.unseal_raw_json()?;

        let mut merged_raw_json = match existing_raw_json {
            Some(serde_json::Value::Object(map)) => map,
            _ => Err(anyhow!("Invalid `raw_json` stored on connection."))?,
        };

        let final_refresh_token = match raw_json["refresh_token"].as_str() {
            Some(new_refresh_token) => new_refresh_token.to_string(),
            None => {
                // If the MCP server do not return a new refresh token when refreshing an access token.
                // So we merge the new raw_json information in the existing one to preserve original
                // refresh token.
                merged_raw_json["refresh_token"] = serde_json::Value::String(refresh_token.clone());
                refresh_token
            }
        };

        merged_raw_json["access_token"] = raw_json["access_token"].clone();

        // Only overwrite expires_in and token_type if present in the refresh response.
        if let Some(expires_in_val) = raw_json.get("expires_in") {
            merged_raw_json["expires_in"] = expires_in_val.clone();
        }
        if let Some(token_type_val) = raw_json.get("token_type") {
            merged_raw_json["token_type"] = token_type_val.clone();
        }

        // If we have a scope, we add it to the merged raw_json.
        if let Some(scope) = scope {
            merged_raw_json["scope"] = serde_json::Value::String(scope);
        }

        // In a refresh context there is always a refresh token, so default to 1h if missing.
        let access_token_expiry = compute_access_token_expiry(expires_in, true);

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token: Some(final_refresh_token),
            raw_json: serde_json::Value::Object(merged_raw_json),
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
            } if *status == 400 => {
                // Detect both "invalid_grant" and "invalid_refresh_token" as revoked token indicators.
                let is_revoked =
                    message.contains("invalid_grant") || message.contains("invalid_refresh_token");
                info!(message, is_revoked, "MCP 400 error");
                if is_revoked {
                    ProviderError::TokenRevokedError
                } else {
                    // Call the default implementation for other 400 errors.
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
