use anyhow::{anyhow, Result};
use async_trait::async_trait;

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult, SqlDialect},
        remote_databases::snowflake::SnowflakeRemoteDatabase,
        table::Table,
        table_schema::TableSchema,
    },
    oauth::{client::OauthClient, credential::CredentialProvider},
};

#[async_trait]
pub trait RemoteDatabase {
    fn dialect(&self) -> SqlDialect;

    // Checks that the query only uses tables from the passed vector of tables and
    // then executes the query.
    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError>;
    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<TableSchema>>;
}

pub async fn get_remote_database(
    credential_id: &str,
) -> Result<Box<dyn RemoteDatabase + Sync + Send>> {
    let (provider, content) = OauthClient::get_credential(credential_id).await?;

    match provider {
        CredentialProvider::Snowflake => {
            let db = SnowflakeRemoteDatabase::new(content)?;
            Ok(Box::new(db) as Box<dyn RemoteDatabase + Sync + Send>)
        }
        _ => Err(anyhow!("Provider {} is not a remote database", provider)),
    }
}
