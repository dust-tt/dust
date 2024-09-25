use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use serde_json::Value;
use tokio_postgres::{types::ToSql, NoTls};

use crate::{databases::table::Row, utils};

#[async_trait]
pub trait DatabasesStore {
    async fn init(&self) -> Result<()>;
    async fn load_table_row(&self, table_id: &str, row_id: &str) -> Result<Option<Row>>;
    async fn list_table_rows(
        &self,
        table_id: &str,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)>;
    async fn batch_upsert_table_rows(
        &self,
        table_id: &str,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()>;
    async fn delete_table_rows(&self, table_id: &str) -> Result<()>;
    async fn delete_table_row(&self, table_id: &str, row_id: &str) -> Result<()>;

    fn clone_box(&self) -> Box<dyn DatabasesStore + Sync + Send>;
}

impl Clone for Box<dyn DatabasesStore + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

#[derive(Clone)]
pub struct PostgresDatabasesStore {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

impl PostgresDatabasesStore {
    pub async fn new(db_uri: &str) -> Result<Self> {
        let manager = PostgresConnectionManager::new_from_stringlike(db_uri, NoTls)?;
        let pool = Pool::builder().max_size(16).build(manager).await?;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DatabasesStore for PostgresDatabasesStore {
    async fn init(&self) -> Result<()> {
        let conn = self.pool.get().await?;
        for table in POSTGRES_TABLES {
            conn.execute(table, &[]).await?;
        }
        for index in SQL_INDEXES {
            conn.execute(index, &[]).await?;
        }
        Ok(())
    }

    async fn load_table_row(&self, table_id: &str, row_id: &str) -> Result<Option<Row>> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare(
                "SELECT created, row_id, content
                FROM tables_rows
                WHERE table_id = $1 AND row_id = $2
                LIMIT 1",
            )
            .await?;

        let r = c.query(&stmt, &[&table_id, &row_id]).await?;

        let d: Option<(i64, String, String)> = match r.len() {
            0 => None,
            1 => Some((r[0].get(0), r[0].get(1), r[0].get(2))),
            _ => unreachable!(),
        };

        match d {
            None => Ok(None),
            Some((_, row_id, data)) => Ok(Some(Row::new(row_id, serde_json::from_str(&data)?))),
        }
    }

    async fn list_table_rows(
        &self,
        table_id: &str,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let mut params: Vec<&(dyn ToSql + Sync)> = vec![&table_id];
        let mut query = "SELECT created, row_id, content
            FROM tables_rows
            WHERE table_id = $1
            ORDER BY created DESC"
            .to_string();

        let limit_i64: i64;
        let offset_i64: i64;
        if let Some((limit, offset)) = limit_offset {
            query.push_str(" LIMIT $2 OFFSET $3");
            limit_i64 = limit as i64;
            offset_i64 = offset as i64;
            params.push(&limit_i64);
            params.push(&(offset_i64));
        }

        let rows = c.query(&query, &params).await?;

        let rows: Vec<Row> = rows
            .iter()
            .map(|row| {
                let row_id: String = row.get(1);
                let data: String = row.get(2);
                let content: Value = serde_json::from_str(&data)?;
                Ok(Row::new(row_id, content))
            })
            .collect::<Result<Vec<_>>>()?;

        let total = match limit_offset {
            None => rows.len(),
            Some(_) => {
                let t: i64 = c
                    .query_one(
                        "SELECT COUNT(*)
                        FROM tables_rows
                        WHERE table_id = $1",
                        &[&table_id],
                    )
                    .await?
                    .get(0);
                t as usize
            }
        };

        Ok((rows, total))
    }

    async fn batch_upsert_table_rows(
        &self,
        table_id: &str,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        // Start transaction.
        let c = c.transaction().await?;

        // Truncate table if required.
        if truncate {
            let stmt = c
                .prepare(
                    "DELETE FROM tables_rows
                    WHERE table_id = $1",
                )
                .await?;
            c.execute(&stmt, &[&table_id]).await?;
        }

        // Prepare insertion/updation statement.
        let stmt = c
            .prepare(
                "INSERT INTO tables_rows
                (id, table_id, row_id, created, content)
                VALUES (DEFAULT, $1, $2, $3, $4)
                ON CONFLICT (table_id, row_id) DO UPDATE
                SET content = EXCLUDED.content",
            )
            .await?;

        for row in rows {
            c.execute(
                &stmt,
                &[
                    &table_id,
                    &row.row_id(),
                    &(utils::now() as i64),
                    &row.content().to_string(),
                ],
            )
            .await?;
        }

        c.commit().await?;

        Ok(())
    }

    async fn delete_table_rows(&self, table_id: &str) -> Result<()> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare("DELETE FROM tables_rows WHERE table_id = $1")
            .await?;

        c.execute(&stmt, &[&table_id]).await?;

        Ok(())
    }

    async fn delete_table_row(&self, table_id: &str, row_id: &str) -> Result<()> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare("DELETE FROM tables_rows WHERE table_id = $1 AND row_id = $2")
            .await?;

        c.execute(&stmt, &[&table_id, &row_id]).await?;

        Ok(())
    }

    fn clone_box(&self) -> Box<dyn DatabasesStore + Sync + Send> {
        Box::new(self.clone())
    }
}

pub const POSTGRES_TABLES: [&'static str; 1] = [
    //
    "CREATE TABLE IF NOT EXISTS tables_rows (
    id                   BIGSERIAL PRIMARY KEY,
    created              BIGINT NOT NULL,
    table_id             TEXT NOT NULL, -- unique ID of the table (globally)
    row_id               TEXT NOT NULL, -- unique within table
    content              TEXT NOT NULL -- json
 );",
];

pub const SQL_INDEXES: [&'static str; 2] = [
    "CREATE UNIQUE INDEX IF NOT EXISTS tables_rows_unique ON tables_rows (row_id, table_id);",
    "CREATE INDEX IF NOT EXISTS tables_rows_table_id ON tables_rows (table_id);",
];
