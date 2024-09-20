use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use snowflake_connector_rs::{SnowflakeAuthMethod, SnowflakeClient, SnowflakeClientConfig};

use crate::databases::remote_databases::remote_database::RemoteDatabase;

pub struct SnowflakeRemoteDatabase {
    client: SnowflakeClient,
}

#[derive(Deserialize)]
struct SnowflakeConnectionDetails {
    username: String,
    password: String,
    account: String,
    role: String,
    warehouse: String,
}

impl SnowflakeRemoteDatabase {
    pub async fn new(secret: &str) -> Result<Self> {
        let connection_details: SnowflakeConnectionDetails = serde_json::from_str(secret)?;

        let client = SnowflakeClient::new(
            &connection_details.username,
            SnowflakeAuthMethod::Password(connection_details.password),
            SnowflakeClientConfig {
                warehouse: Some(connection_details.warehouse),
                account: connection_details.account,
                role: Some(connection_details.role),
                database: None,
                schema: None,
                timeout: Some(std::time::Duration::from_secs(30)),
            },
        )?;

        Ok(Self { client })
    }
}

#[async_trait]
impl RemoteDatabase for SnowflakeRemoteDatabase {
    async fn get_tables_used_by_query(&self, query: &str) -> Result<Vec<String>> {
        let session = self.client.create_session().await?;

        let explain_query = format!("EXPLAIN {}", query);
        let explain_rows = session
            .query(explain_query.clone())
            .await?
            .iter()
            .filter_map(|row| match row.get::<String>("objects") {
                Ok(objects) => Some(objects),
                _ => None,
            })
            .collect();

        Ok(explain_rows)
    }
}
