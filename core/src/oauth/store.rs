use crate::oauth::connection::{Connection, ConnectionProvider, ConnectionStatus};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

#[async_trait]
pub trait OAuthStore {
    async fn create_connection(&self, provider: ConnectionProvider) -> Result<Connection>;

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
    async fn create_connection(&self, provider: ConnectionProvider) -> Result<Connection> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let created = utils::now();
        let status = ConnectionStatus::Pending;
        let secret = utils::new_id();

        // Create connection
        let stmt = c
            .prepare(
                "INSERT INTO connections (id, created, provider, status, secret)
                   VALUES (DEFAULT, $1, $2, $3, $4) RETURNING id",
            )
            .await?;
        let row_id: i64 = c
            .query_one(
                &stmt,
                &[
                    &(created as i64),
                    &serde_json::to_string(&provider)?,
                    &serde_json::to_string(&status)?,
                    &secret,
                ],
            )
            .await?
            .get(0);

        let connection_id = utils::make_id("con", row_id as u64)?;

        Ok(Connection::new(
            connection_id,
            created,
            provider,
            status,
            secret,
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
       status               TEXT NOT NULL,
       secret               TEXT NOT NULL,
       authorization_code   TEXT,
       access_token         TEXT,
       access_token_expiry  BIGINT,
       refresh_token        TEXT,
       raw_json             JSONB
    );"];

pub const SQL_INDEXES: [&'static str; 0] = [];
