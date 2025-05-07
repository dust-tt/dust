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

lazy_static! {
    static ref OAUTH_NOTION_CLIENT_ID: String = env::var("OAUTH_NOTION_CLIENT_ID").unwrap();
    static ref OAUTH_NOTION_CLIENT_SECRET: String = env::var("OAUTH_NOTION_CLIENT_SECRET").unwrap();
    static ref OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID: String =
        env::var("OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID").unwrap();
    static ref OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_SECRET: String =
        env::var("OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_SECRET").unwrap();
}

#[derive(Debug, PartialEq, Clone)]
pub enum NotionUseCase {
    Connection,
    PlatformActions,
}

impl NotionUseCase {
    pub fn from_str(s: Option<&str>) -> Result<Self> {
        match s {
            Some("connection") | None => Ok(NotionUseCase::Connection),
            Some("platform_actions") => Ok(NotionUseCase::PlatformActions),
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
            NotionUseCase::Connection => (&*OAUTH_NOTION_CLIENT_ID, &*OAUTH_NOTION_CLIENT_SECRET),
        };
        general_purpose::STANDARD.encode(&format!("{}:{}", client_id, client_secret))
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

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json,
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
