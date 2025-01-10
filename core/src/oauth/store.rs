use std::str::FromStr;

use crate::oauth::connection::{Connection, ConnectionProvider, ConnectionStatus};
use crate::oauth::credential::{Credential, CredentialProvider};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

use super::credential::CredentialMetadata;

#[async_trait]
pub trait OAuthStore {
    async fn create_connection(
        &self,
        provider: ConnectionProvider,
        metadata: serde_json::Value,
    ) -> Result<Connection>;
    async fn retrieve_connection(
        &self,
        provider: ConnectionProvider,
        connection_id: &str,
    ) -> Result<Connection>;
    async fn update_connection_secrets(&self, connection: &Connection) -> Result<()>;
    async fn update_connection_status(&self, connection: &Connection) -> Result<()>;

    async fn create_credential(
        &self,
        provider: CredentialProvider,
        metadata: CredentialMetadata,
        encrypted_content: Vec<u8>,
    ) -> Result<Credential>;
    async fn retrieve_credential(&self, credential_id: &str) -> Result<Credential>;
    async fn delete_credential(&self, credential_id: &str) -> Result<()>;

    fn clone_box(&self) -> Box<dyn OAuthStore + Sync + Send>;
}

impl Clone for Box<dyn OAuthStore + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

#[derive(Clone)]
pub struct PostgresOAuthStore {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

impl PostgresOAuthStore {
    pub async fn new(db_uri: &str) -> Result<Self> {
        let manager = PostgresConnectionManager::new_from_stringlike(db_uri, NoTls)?;
        let pool = Pool::builder().max_size(16).build(manager).await?;
        Ok(Self { pool })
    }

    pub async fn init(&self) -> Result<()> {
        // Execute the SQL query within a transaction
        // use a pg_advisory_xact_lock to avoid race conditions

        let mut conn = self.pool.get().await?;
        let builder = conn.build_transaction();
        let tx = builder.start().await?;

        tx.execute("SELECT pg_advisory_xact_lock(12345)", &[])
            .await?;

        for table in POSTGRES_TABLES {
            tx.execute(table, &[]).await?;
        }

        for index in SQL_INDEXES {
            tx.execute(index, &[]).await?;
        }

        tx.commit().await?;

        Ok(())
    }
}

#[async_trait]
impl OAuthStore for PostgresOAuthStore {
    async fn create_connection(
        &self,
        provider: ConnectionProvider,
        metadata: serde_json::Value,
    ) -> Result<Connection> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let created = utils::now();
        let status = ConnectionStatus::Pending;
        let secret = utils::new_id();

        // Create connection
        let stmt = c
            .prepare(
                "INSERT INTO connections (id, created, provider, secret, status, metadata)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5::jsonb) RETURNING id",
            )
            .await?;
        let row_id: i64 = c
            .query_one(
                &stmt,
                &[
                    &(created as i64),
                    &provider.to_string(),
                    &secret,
                    &status.to_string(),
                    &metadata,
                ],
            )
            .await?
            .get(0);

        let connection_id = Connection::connection_id_from_row_id_and_secret(row_id, &secret)?;

        Ok(Connection::new(
            connection_id,
            created,
            provider,
            status,
            metadata,
            None,
            None,
            None,
            None,
            None,
            None,
        ))
    }

    async fn retrieve_connection(
        &self,
        provider: ConnectionProvider,
        connection_id: &str,
    ) -> Result<Connection> {
        let (row_id, secret) = Connection::row_id_and_secret_from_connection_id(connection_id)?;

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query_one(
                "SELECT created, status, metadata,
                        redirect_uri, encrypted_authorization_code,
                        access_token_expiry, encrypted_access_token,
                        encrypted_refresh_token, encrypted_raw_json
                   FROM connections
                   WHERE id = $1 AND provider = $2 AND secret = $3",
                &[&row_id, &provider.to_string(), &secret],
            )
            .await?;

        let created: i64 = r.get(0);
        let status: ConnectionStatus = ConnectionStatus::from_str(r.get(1))?;
        let metadata: serde_json::Value = r.get(2);
        let redirect_uri: Option<String> = r.get(3);
        let encrypted_authorization_code: Option<Vec<u8>> = r.get(4);
        let access_token_expiry: Option<i64> = r.get(5);
        let encrypted_access_token: Option<Vec<u8>> = r.get(6);
        let encrypted_refresh_token: Option<Vec<u8>> = r.get(7);
        let encrypted_raw_json: Option<Vec<u8>> = r.get(8);

        Ok(Connection::new(
            connection_id.to_string(),
            created as u64,
            provider,
            status,
            metadata,
            redirect_uri,
            encrypted_authorization_code,
            match access_token_expiry {
                Some(e) => Some(e as u64),
                None => None,
            },
            encrypted_access_token,
            encrypted_refresh_token,
            encrypted_raw_json,
        ))
    }

    async fn update_connection_secrets(&self, connection: &Connection) -> Result<()> {
        let (row_id, secret) =
            Connection::row_id_and_secret_from_connection_id(&connection.connection_id())?;

        let access_token_expiry = match connection.access_token_expiry() {
            Some(e) => Some(e as i64),
            None => None,
        };

        let pool = self.pool.clone();
        let c = pool.get().await?;

        c.execute(
            "UPDATE connections
                SET redirect_uri = $1,
                    encrypted_authorization_code = $2,
                    access_token_expiry = $3,
                    encrypted_access_token = $4,
                    encrypted_refresh_token = $5,
                    encrypted_raw_json = $6
              WHERE id = $7 AND provider = $8 AND secret = $9",
            &[
                &connection.redirect_uri(),
                &connection.encrypted_authorization_code(),
                &access_token_expiry,
                &connection.encrypted_access_token(),
                &connection.encrypted_refresh_token(),
                &connection.encrypted_raw_json(),
                &row_id,
                &connection.provider().to_string(),
                &secret,
            ],
        )
        .await?;

        Ok(())
    }

    async fn update_connection_status(&self, connection: &Connection) -> Result<()> {
        let (row_id, secret) =
            Connection::row_id_and_secret_from_connection_id(&connection.connection_id())?;

        let pool = self.pool.clone();
        let c = pool.get().await?;

        c.execute(
            "UPDATE connections
                SET status = $1
              WHERE id = $2 AND provider = $3 AND secret = $4",
            &[
                &connection.status().to_string(),
                &row_id,
                &connection.provider().to_string(),
                &secret,
            ],
        )
        .await?;

        Ok(())
    }

    async fn create_credential(
        &self,
        provider: CredentialProvider,
        metadata: CredentialMetadata,
        encrypted_content: Vec<u8>,
    ) -> Result<Credential> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let created = utils::now();
        let secret = utils::new_id();

        let stmt = c
            .prepare(
                "INSERT INTO credentials (id, created, secret, provider, metadata, encrypted_content)
                   VALUES (DEFAULT, $1, $2, $3, $4::jsonb, $5) RETURNING id",
            )
            .await?;
        let row_id: i64 = c
            .query_one(
                &stmt,
                &[
                    &(created as i64),
                    &secret,
                    &provider.to_string(),
                    &(serde_json::to_value(&metadata)?),
                    &encrypted_content,
                ],
            )
            .await?
            .get(0);

        let credential_id = Credential::credential_id_from_row_id_and_secret(row_id, &secret)?;

        Ok(Credential::new(
            credential_id,
            created,
            provider,
            metadata,
            encrypted_content,
        ))
    }

    async fn retrieve_credential(&self, credential_id: &str) -> Result<Credential> {
        let (row_id, secret) = Credential::row_id_and_secret_from_credential_id(credential_id)?;

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query_one(
                "SELECT created, provider, metadata, encrypted_content
                   FROM credentials
                   WHERE id = $1 AND secret = $2",
                &[&row_id, &secret],
            )
            .await?;

        let created: i64 = r.get(0);
        let provider: CredentialProvider = CredentialProvider::from_str(r.get(1))?;
        let metadata: CredentialMetadata = serde_json::from_value(r.get(2))?;
        let encrypted_content: Vec<u8> = r.get(3);

        Ok(Credential::new(
            credential_id.to_string(),
            created as u64,
            provider,
            metadata,
            encrypted_content,
        ))
    }

    async fn delete_credential(&self, credential_id: &str) -> Result<()> {
        let (row_id, secret) = Credential::row_id_and_secret_from_credential_id(credential_id)?;

        let pool = self.pool.clone();
        let c = pool.get().await?;

        c.execute(
            "DELETE FROM credentials
              WHERE id = $1 AND secret = $2",
            &[&row_id, &secret],
        )
        .await?;

        Ok(())
    }

    fn clone_box(&self) -> Box<dyn OAuthStore + Sync + Send> {
        Box::new(self.clone())
    }
}

pub const POSTGRES_TABLES: [&'static str; 2] = [
    "-- connections
    CREATE TABLE IF NOT EXISTS connections (
       id                             BIGSERIAL PRIMARY KEY,
       created                        BIGINT NOT NULL,
       provider                       TEXT NOT NULL,
       secret                         TEXT NOT NULL,
       status                         TEXT NOT NULL,
       metadata                       JSONB,
       access_token_expiry            BIGINT,
       redirect_uri                   TEXT,
       encrypted_authorization_code   BYTEA,
       encrypted_access_token         BYTEA,
       encrypted_refresh_token        BYTEA,
       encrypted_raw_json             BYTEA
    );",
    "-- secrets
    CREATE TABLE IF NOT EXISTS credentials (
       id                             BIGSERIAL PRIMARY KEY,
       created                        BIGINT NOT NULL,
       provider                       TEXT NOT NULL,
       metadata                       JSONB,
       secret                         TEXT NOT NULL,
       encrypted_content          BYTEA
    );",
];

pub const SQL_INDEXES: [&'static str; 0] = [];
