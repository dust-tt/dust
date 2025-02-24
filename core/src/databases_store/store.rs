use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use futures::SinkExt;
use std::io::Cursor;
use tokio_postgres::{types::ToSql, NoTls};
use tracing::info;

use crate::{databases::table::Row, utils};

#[async_trait]
pub trait DatabasesStore {
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
        let pool = Pool::builder().max_size(32).build(manager).await?;
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
impl DatabasesStore for PostgresDatabasesStore {
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
                let content: serde_json::Map<String, serde_json::Value> =
                    serde_json::from_str(&data)?;
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
        let c = pool.get().await?;

        // Truncate table if required. Rows can be numerous so we delete rows in small batches to
        // avoid long running operations.
        if truncate {
            let deletion_batch_size: u64 = 512;

            let stmt = c
                .prepare(
                    "DELETE FROM tables_rows WHERE id IN (
                   SELECT id FROM tables_rows WHERE table_id = $1 LIMIT $2
                 )",
                )
                .await?;

            loop {
                let now = utils::now();
                let deleted_rows = c
                    .execute(&stmt, &[&table_id, &(deletion_batch_size as i64)])
                    .await?;

                info!(
                    duration = utils::now() - now,
                    table_id, deleted_rows, "DSSTRUCTSTAT [upsert_rows] truncation batch"
                );

                if deleted_rows < deletion_batch_size {
                    break;
                }
            }
        }

        // For now, only do it if we are inserting more than 1024 rows
        if truncate && rows.len() > 1024 {
            // Start COPY operation directly into the target table
            let mut sink = c
            .copy_in("COPY tables_rows (table_id, row_id, created, content) FROM STDIN WITH (FORMAT text)")
            .await?;

            let now = utils::now() as i64;

            // Create a single buffer for all the data
            let mut buffer = Vec::new();

            for row in rows {
                // Escape special characters in content
                let escaped_content = serde_json::Value::Object(row.content().clone())
                    .to_string()
                    // Postgresql [doc](https://www.postgresql.org/docs/current/sql-copy.html)
                    // Backslash characters (\) can be used in the COPY data to quote data characters that might otherwise be taken as row or column delimiters.
                    // In particular, the following characters must be preceded by a backslash if they appear as part of a column value:
                    // the backslash itself, newline, carriage return, and the current delimiter character.
                    .replace('\\', "\\\\")
                    .replace('\n', "\\n")
                    .replace('\r', "\\r")
                    .replace('\t', "\\t");

                // Format: table_id, row_id, created, content
                let line = format!(
                    "{}\t{}\t{}\t{}\n",
                    table_id,
                    row.row_id(),
                    now,
                    &escaped_content
                );

                buffer.extend_from_slice(line.as_bytes());
            }

            // Send all data at once
            let mut pinned_sink = std::pin::pin!(sink);
            pinned_sink.send(Cursor::new(buffer)).await?;

            // Close the sink
            let rows_count = pinned_sink.finish().await?;

            if rows_count != rows.len() as u64 {
                return Err(anyhow::anyhow!("Failed to insert all rows"));
            }

            info!(
                duration = utils::now() - now as u64,
                table_id,
                inserted_rows = rows_count,
                "DSSTRUCTSTAT [upsert_rows] insertion batch (COPY)"
            );
        } else {
            let stmt = c
                .prepare(
                    "INSERT INTO tables_rows
                    (table_id, row_id, created, content)
                    SELECT * FROM UNNEST($1::text[], $2::text[], $3::bigint[], $4::text[])
                    ON CONFLICT (table_id, row_id) DO UPDATE
                    SET content = EXCLUDED.content",
                )
                .await?;

            for chunk in rows.chunks(1024) {
                let now = utils::now() as i64;

                let table_ids: Vec<&str> = vec![table_id; chunk.len()];
                let row_ids: Vec<&str> = chunk.iter().map(|r| r.row_id()).collect();
                let createds: Vec<i64> = vec![now; chunk.len()];
                let contents: Vec<String> = chunk
                    .iter()
                    .map(|r| serde_json::Value::Object(r.content().clone()).to_string())
                    .collect();

                c.execute(&stmt, &[&table_ids, &row_ids, &createds, &contents])
                    .await?;

                info!(
                    duration = utils::now() - now as u64,
                    table_id,
                    inserted_rows = chunk.len(),
                    "DSSTRUCTSTAT [upsert_rows] insertion batch (INSERT...ON CONFLICT)"
                );
            }
        }

        Ok(())
    }

    async fn delete_table_rows(&self, table_id: &str) -> Result<()> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let deletion_batch_size: u64 = 512;

        let stmt = c
            .prepare(
                "DELETE FROM tables_rows WHERE id IN (
                   SELECT id FROM tables_rows WHERE table_id = $1 LIMIT $2
                 )",
            )
            .await?;

        loop {
            let deleted_rows = c
                .execute(&stmt, &[&table_id, &(deletion_batch_size as i64)])
                .await?;

            if deleted_rows < deletion_batch_size {
                break;
            }
        }

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
