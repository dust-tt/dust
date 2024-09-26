use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult},
        table::Table,
        table_schema::TableSchema,
    },
    oauth::{client::OauthClient, credential::CredentialProvider},
};

use super::snowflake::SnowflakeRemoteDatabase;

#[async_trait]
pub trait RemoteDatabase {
    async fn get_tables_used_by_query(&self, query: &str) -> Result<Vec<String>>;
    // Checks that the query only uses tables from the passed vector of tables and
    // then executes the query.
    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError>;
    async fn get_tables_schema(
        &self,
        opaque_ids: Vec<String>,
    ) -> Result<HashMap<String, TableSchema>>;
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
    }
}
