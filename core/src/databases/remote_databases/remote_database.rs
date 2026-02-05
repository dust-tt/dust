use std::time::Duration;

use anyhow::{anyhow, Result};
use async_trait::async_trait;

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

#[async_trait]
pub trait RemoteDatabase {
    fn dialect(&self) -> SqlDialect;

    // Checks that the query only uses tables from the passed vector of tables and
    // then executes the query.
    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
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
