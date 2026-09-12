use std::collections::HashMap;
use std::time::Duration;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Maximum duration a data warehouse query is allowed to run before being cancelled.
pub const QUERY_TIMEOUT: Duration = Duration::from_secs(120);

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult, SqlDialect},
        remote_databases::snowflake::snowflake::SnowflakeRemoteDatabase,
        table::Table,
        table_schema::TableSchema,
    },
    oauth::{
        client::OauthClient,
        credential::{CredentialProvider, CREDENTIAL_ID_PREFIX},
    },
};

use super::bigquery::get_bigquery_remote_database;

/// Opaque Dust identity attached to remote warehouse query jobs for cost attribution.
///
/// Values are Dust sIds (workspace / agent configuration / user). They are written into the
/// customer's own warehouse logs (BigQuery job labels / Snowflake QUERY_TAG).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct QueryIdentityContext {
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
}

impl QueryIdentityContext {
    pub fn is_empty(&self) -> bool {
        self.workspace_id.is_none() && self.agent_id.is_none() && self.user_id.is_none()
    }

    /// BigQuery label values: `[a-z0-9_-]` only, ≤63 chars.
    ///
    /// Dust sIds are case-sensitive, but BigQuery rejects uppercase, so we use a
    /// reversible encoding (see [`sanitize_bigquery_label_value`]).
    pub fn to_bigquery_labels(&self) -> HashMap<String, String> {
        let mut labels = HashMap::new();
        if let Some(value) = self
            .workspace_id
            .as_deref()
            .and_then(sanitize_bigquery_label_value)
        {
            labels.insert("dust_workspace".to_string(), value);
        }
        if let Some(value) = self
            .agent_id
            .as_deref()
            .and_then(sanitize_bigquery_label_value)
        {
            labels.insert("dust_agent".to_string(), value);
        }
        if let Some(value) = self
            .user_id
            .as_deref()
            .and_then(sanitize_bigquery_label_value)
        {
            labels.insert("dust_user".to_string(), value);
        }
        labels
    }

    /// Free-form JSON string for Snowflake `QUERY_TAG`.
    pub fn to_snowflake_query_tag(&self) -> Option<String> {
        let mut map = serde_json::Map::new();
        if let Some(workspace_id) = &self.workspace_id {
            map.insert("dust_workspace".to_string(), json!(workspace_id));
        }
        if let Some(agent_id) = &self.agent_id {
            map.insert("dust_agent".to_string(), json!(agent_id));
        }
        if let Some(user_id) = &self.user_id {
            map.insert("dust_user".to_string(), json!(user_id));
        }
        if map.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(map).to_string())
        }
    }
}

/// Encode a Dust sId into a BigQuery-safe label value without losing case.
///
/// BigQuery only allows `[a-z0-9_-]`, while Dust sIds are case-sensitive base62.
/// Encoding:
/// - `a-z`, `0-9`, `-` → as-is
/// - `_` → `__`
/// - `A-Z` → `_` + lowercase letter
/// - other characters are dropped
/// - truncated to 63 characters
fn sanitize_bigquery_label_value(value: &str) -> Option<String> {
    let mut sanitized = String::new();
    for c in value.chars() {
        match c {
            'a'..='z' | '0'..='9' | '-' => {
                if sanitized.len() >= 63 {
                    break;
                }
                sanitized.push(c);
            }
            '_' => {
                if sanitized.len() + 2 > 63 {
                    break;
                }
                sanitized.push_str("__");
            }
            'A'..='Z' => {
                if sanitized.len() + 2 > 63 {
                    break;
                }
                sanitized.push('_');
                sanitized.push(c.to_ascii_lowercase());
            }
            _ => {}
        }
    }
    if sanitized.is_empty() {
        None
    } else {
        Some(sanitized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_bigquery_labels_preserves_case_and_omits_empty() {
        let identity = QueryIdentityContext {
            workspace_id: Some("Workspace_ABC".to_string()),
            agent_id: Some("agent:bad|value".to_string()),
            user_id: Some("".to_string()),
        };

        let labels = identity.to_bigquery_labels();
        // W→_w, _→__, A→_a, B→_b, C→_c
        assert_eq!(
            labels.get("dust_workspace"),
            Some(&"_workspace___a_b_c".to_string())
        );
        assert_eq!(labels.get("dust_agent"), Some(&"agentbadvalue".to_string()));
        assert!(!labels.contains_key("dust_user"));
    }

    #[test]
    fn to_bigquery_labels_encodes_typical_sid() -> Result<()> {
        let sid = "cac_fG9iWy1dn6";
        let encoded =
            sanitize_bigquery_label_value(sid).ok_or_else(|| anyhow!("expected encoded label"))?;
        assert_eq!(encoded, "cac__f_g9i_wy1dn6");
        Ok(())
    }

    #[test]
    fn to_snowflake_query_tag_is_json() -> Result<()> {
        let identity = QueryIdentityContext {
            workspace_id: Some("ws1".to_string()),
            agent_id: Some("agt1".to_string()),
            user_id: None,
        };

        let tag = identity
            .to_snowflake_query_tag()
            .ok_or_else(|| anyhow!("expected query tag"))?;
        let parsed: serde_json::Value = serde_json::from_str(&tag)?;
        assert_eq!(parsed["dust_workspace"], "ws1");
        assert_eq!(parsed["dust_agent"], "agt1");
        assert!(parsed.get("dust_user").is_none());
        Ok(())
    }
}

#[async_trait]
pub trait RemoteDatabase {
    fn dialect(&self) -> SqlDialect;

    // Checks that the query only uses tables from the passed vector of tables and
    // then executes the query.
    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
        query_identity: Option<&QueryIdentityContext>,
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError>;
    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<Option<TableSchema>>>;
    fn should_use_column_description(&self, _table: &Table) -> bool {
        false
    }
}

pub async fn get_remote_database(
    credential_or_connection_id: &str,
) -> Result<Box<dyn RemoteDatabase + Sync + Send>> {
    match credential_or_connection_id {
        id if id.starts_with(CREDENTIAL_ID_PREFIX) => {
            let (provider, content) = OauthClient::get_credential(id).await?;
            match provider {
                CredentialProvider::Snowflake => {
                    let db = SnowflakeRemoteDatabase::new(content)?;
                    Ok(Box::new(db) as Box<dyn RemoteDatabase + Sync + Send>)
                }
                CredentialProvider::Bigquery => get_bigquery_remote_database(content).await,
                provider => Err(anyhow!("Provider {} is not a remote database", provider)),
            }
        }
        _ => Err(anyhow!("Invalid credential or connection id")),
    }
}
