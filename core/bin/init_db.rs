use anyhow::Result;
use dust::{
    databases_store::store::PostgresDatabasesStore, oauth::store::PostgresOAuthStore,
    stores::postgres::PostgresStore,
};
use tokio;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let s = PostgresStore::new(&db_uri).await?;
            s.init().await?;
        }
        Err(_) => print!("CORE_DATABASE_URI not set. Tables not initialized."),
    };

    match std::env::var("OAUTH_DATABASE_URI") {
        Ok(db_uri) => {
            let s = PostgresOAuthStore::new(&db_uri).await?;
            s.init().await?;
        }
        Err(_) => println!("OAUTH_DATABASE_URI not set. Tables not initialized."),
    };
    match std::env::var("DATABASES_STORE_DATABASE_URI") {
        Ok(db_uri) => {
            let s = PostgresDatabasesStore::new(&db_uri).await?;
            s.init().await?;
        }
        Err(_) => println!("DATABASES_STORE_DATABASE_URI not set. Tables not initialized."),
    };

    Ok(())
}
