use anyhow::{anyhow, Result};
use async_trait::async_trait;

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult, SqlDialect},
        remote_databases::snowflake::SnowflakeRemoteDatabase,
        table::Table,
        table_schema::TableSchema,
    },
    oauth::{
        client::OauthClient,
        connection::{ConnectionProvider, CONNECTION_ID_PREFIX},
        credential::{CredentialProvider, CREDENTIAL_ID_PREFIX},
    },
};

use super::{
    bigquery::get_bigquery_remote_database, salesforce::salesforce::SalesforceRemoteDatabase,
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
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError>;
    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<TableSchema>>;
}

pub async fn get_remote_database(
    credential_or_connection_id: &str,
) -> Result<Box<dyn RemoteDatabase + Sync + Send>> {
    match credential_or_connection_id {
        id if id.starts_with(CONNECTION_ID_PREFIX) => {
            let connection = OauthClient::get_connection_access_token(id).await?;
            match connection.connection.provider {
                ConnectionProvider::Salesforce => {
                    let db = SalesforceRemoteDatabase::new(&connection)?;
                    Ok(Box::new(db) as Box<dyn RemoteDatabase + Sync + Send>)
                }
                provider => Err(anyhow!("Provider {} is not a remote database", provider)),
            }
        }
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
