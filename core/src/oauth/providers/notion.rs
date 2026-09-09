use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
    },
    credential::Credential,
    providers::utils::execute_request,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use serde_json::json;
use std::env;
use urlencoding;

lazy_static! {
    static ref OAUTH_NOTION_CLIENT_ID: String = env::var("OAUTH_NOTION_CLIENT_ID").unwrap();
    static ref OAUTH_NOTION_CLIENT_SECRET: String = env::var("OAUTH_NOTION_CLIENT_SECRET").unwrap();
    static ref OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID: String =
        env::var("OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID").unwrap();
    static ref OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_SECRET: String =
        env::var("OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_SECRET").unwrap();
}

/// Extracts the authorizing Notion account (email, falling back to display name) from the OAuth
/// token response. Notion returns the granting identity under `owner.user`. Returns `None` for
/// workspace-level owners that carry no user identity.
fn extract_account_from_raw_json(raw_json: &serde_json::Value) -> Option<String> {
    let user = raw_json.get("owner")?.get("user")?;

    let email = user
        .get("person")
        .and_then(|person| person.get("email"))
        .and_then(|email| email.as_str())
        .map(str::trim)
        .filter(|email| !email.is_empty());
    if let Some(email) = email {
        return Some(email.to_string());
    }

    user.get("name")
        .and_then(|name| name.as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

#[derive(Debug, PartialEq, Clone)]
pub enum NotionUseCase {
    Connection,
    PlatformActions,
    PersonalActions,
}

impl NotionUseCase {
    pub fn from_str(s: Option<&str>) -> Result<Self> {
        match s {
            Some("connection") | None => Ok(NotionUseCase::Connection),
            Some("platform_actions") => Ok(NotionUseCase::PlatformActions),
            Some("personal_actions") => Ok(NotionUseCase::PersonalActions),
            Some(other) => Err(anyhow!(format!(
                "Notion use_case format invalid: {}",
                other
            ))),
        }
    }
}

pub struct NotionConnectionProvider {}

impl NotionConnectionProvider {
    pub fn new() -> Self {
        NotionConnectionProvider {}
    }

    fn basic_auth(&self, use_case: &NotionUseCase) -> String {
        let (client_id, client_secret) = match use_case {
            NotionUseCase::PlatformActions => (
                &*OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID,
                &*OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_SECRET,
            ),
            NotionUseCase::PersonalActions => (
                &*OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID,
                &*OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_SECRET,
            ),
            NotionUseCase::Connection => (&*OAUTH_NOTION_CLIENT_ID, &*OAUTH_NOTION_CLIENT_SECRET),
        };
        // RFC 6749 §2.3.1 requires URL-encoding client_id and client_secret before base64-encoding.
        general_purpose::STANDARD.encode(&format!(
            "{}:{}",
            urlencoding::encode(client_id),
            urlencoding::encode(client_secret)
        ))
    }
}

#[async_trait]
impl Provider for NotionConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Notion
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let use_case = NotionUseCase::from_str(connection.metadata()["use_case"].as_str())?;
        let body = json!({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        });

        let req = self
            .reqwest_client()
            .post("https://api.notion.com/v1/oauth/token")
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Basic {}", self.basic_auth(&use_case)),
            )
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Notion, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Notion"))?,
        };

        // Surface the authorizing Notion account so admins can verify which identity backs the
        // connection. Workspace-level owners carry no user identity, so `connected_account` is
        // simply absent in that case.
        let extra_metadata = extract_account_from_raw_json(&raw_json).map(|account| {
            serde_json::Map::from_iter([(
                "connected_account".to_string(),
                serde_json::Value::String(account),
            )])
        });

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json,
            extra_metadata,
        })
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "Notion access tokens do not expire".to_string(),
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

#[cfg(test)]
mod tests {
    use super::extract_account_from_raw_json;
    use serde_json::json;

    #[test]
    fn extracts_person_email() {
        let raw_json = json!({
            "owner": {
                "type": "user",
                "user": {
                    "object": "user",
                    "name": "Etienne Baerd",
                    "type": "person",
                    "person": { "email": "etienne@manageris.com" }
                }
            }
        });
        assert_eq!(
            extract_account_from_raw_json(&raw_json),
            Some("etienne@manageris.com".to_string())
        );
    }

    #[test]
    fn falls_back_to_name_when_email_absent() {
        let raw_json = json!({
            "owner": {
                "type": "user",
                "user": { "object": "user", "name": "Manageris Bot" }
            }
        });
        assert_eq!(
            extract_account_from_raw_json(&raw_json),
            Some("Manageris Bot".to_string())
        );
    }

    #[test]
    fn returns_none_for_workspace_owner_without_user() {
        let raw_json = json!({
            "owner": { "type": "workspace", "workspace": true },
            "workspace_name": "Manageris"
        });
        assert_eq!(extract_account_from_raw_json(&raw_json), None);
    }

    #[test]
    fn ignores_blank_values() {
        let raw_json = json!({
            "owner": {
                "user": { "name": "  ", "person": { "email": "" } }
            }
        });
        assert_eq!(extract_account_from_raw_json(&raw_json), None);
    }
}
