use anyhow::{anyhow, Result};

use crate::{
    databases::remote_databases::remote_database::RemoteDatabase,
    oauth::{client::OauthClient, credential::CredentialProvider},
};

use super::{bigquery::get_bigquery_remote_database, snowflake::SnowflakeRemoteDatabase};

pub async fn get_remote_database(
    credential_id: &str,
) -> Result<Box<dyn RemoteDatabase + Sync + Send>> {
    let (provider, content) = OauthClient::get_credential(credential_id).await?;

    match provider {
        CredentialProvider::Snowflake => {
            let db = SnowflakeRemoteDatabase::new(content)?;
            Ok(Box::new(db) as Box<dyn RemoteDatabase + Sync + Send>)
        }
        CredentialProvider::Bigquery => {
            let db = get_bigquery_remote_database(content).await?;
            Ok(db)
        }
        _ => Err(anyhow!(
            "{:?} is not a supported remote database provider",
            provider
        ))?,
    }
}
