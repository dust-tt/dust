use anyhow::Result;

use crate::{
    databases::remote_databases::remote_database::RemoteDatabase,
    oauth::{client::OauthClient, credential::CredentialProvider},
};

use super::snowflake::SnowflakeRemoteDatabase;

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
