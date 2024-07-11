use std::str::FromStr;

use crate::oauth::connection::{Connection, ConnectionProvider, ConnectionStatus};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

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
        let conn = self.pool.get().await?;
        for table in POSTGRES_TABLES {
            conn.execute(table, &[]).await?;
        }
        for index in SQL_INDEXES {
            conn.execute(index, &[]).await?;
        }
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
                        authorization_code, access_token, access_token_expiry,
                        refresh_token, raw_json
                   FROM connections
                   WHERE id = $1 AND provider = $2 AND secret = $3",
                &[&row_id, &provider.to_string(), &secret],
            )
            .await?;

        let created: i64 = r.get(0);
        let status: ConnectionStatus = ConnectionStatus::from_str(r.get(1))?;
        let metadata: serde_json::Value = r.get(2);
        let authorization_code: Option<String> = r.get(3);
        let access_token: Option<String> = r.get(4);
        let access_token_expiry: Option<i64> = r.get(5);
        let refresh_token: Option<String> = r.get(6);
        let raw_json: Option<serde_json::Value> = r.get(7);

        Ok(Connection::new(
            connection_id.to_string(),
            created as u64,
            provider,
            status,
            metadata,
            authorization_code,
            access_token,
            match access_token_expiry {
                Some(e) => Some(e as u64),
                None => None,
            },
            refresh_token,
            raw_json,
        ))
    }

    fn clone_box(&self) -> Box<dyn OAuthStore + Sync + Send> {
        Box::new(self.clone())
    }
}

pub const POSTGRES_TABLES: [&'static str; 1] = ["-- connections
    CREATE TABLE IF NOT EXISTS connections (
       id                   BIGSERIAL PRIMARY KEY,
       created              BIGINT NOT NULL,
       provider             TEXT NOT NULL,
       secret               TEXT NOT NULL,
       status               TEXT NOT NULL,
       metadata             JSONB,
       authorization_code   TEXT,
       access_token         TEXT,
       access_token_expiry  BIGINT,
       refresh_token        TEXT,
       raw_json             JSONB
    );"];

pub const SQL_INDEXES: [&'static str; 0] = [];
