use crate::blocks::block::{Block, BlockResult, BlockType, Env};
use crate::databases::database::DatabaseSchemaTable;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

use super::helpers::get_data_source_project;

#[derive(Clone)]
pub struct DatabaseSchema {}

impl DatabaseSchema {
    pub fn parse(_block_pair: Pair<Rule>) -> Result<Self> {
        Ok(DatabaseSchema {})
    }
}

#[async_trait]
impl Block for DatabaseSchema {
    fn block_type(&self) -> BlockType {
        BlockType::DatabaseSchema
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("database_schema".as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        let config = env.config.config_for_block(name);

        let err_msg = format!(
            "Invalid or missing `database` in configuration for \
        `database_schema` block `{}` expecting `{{ \"database\": \
        {{ \"workspace_id\": ..., \"data_source_id\": ..., \"database_id\": ... }} }}`",
            name
        );

        let (workspace_id, data_source_id, database_id) = match config {
            Some(v) => match v.get("database") {
                Some(Value::Object(o)) => {
                    let workspace_id = match o.get("workspace_id") {
                        Some(Value::String(s)) => s,
                        _ => Err(anyhow!(err_msg.clone()))?,
                    };
                    let data_source_id = match o.get("data_source_id") {
                        Some(Value::String(s)) => s,
                        _ => Err(anyhow!(err_msg.clone()))?,
                    };
                    let database_id = match o.get("database_id") {
                        Some(Value::String(s)) => s,
                        _ => Err(anyhow!(err_msg.clone()))?,
                    };

                    Ok((workspace_id, data_source_id, database_id))
                }
                _ => Err(anyhow!(err_msg)),
            },
            None => Err(anyhow!(err_msg)),
        }?;

        let schema = get_database_schema(workspace_id, data_source_id, database_id, env).await?;

        Ok(BlockResult {
            value: serde_json::to_value(
                schema
                    .into_iter()
                    .map(|t| {
                        json!({
                            "table_schema": t,
                            "dbml": t.render_dbml(),
                        })
                    })
                    .collect::<Vec<_>>(),
            )?,
            meta: None,
        })
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

async fn get_database_schema(
    workspace_id: &String,
    data_source_id: &String,
    database_id: &String,
    env: &Env,
) -> Result<Vec<DatabaseSchemaTable>> {
    let project = get_data_source_project(workspace_id, data_source_id, env).await?;
    let database = match env
        .store
        .load_database(&project, data_source_id, database_id)
        .await?
    {
        Some(d) => d,
        None => Err(anyhow!(
            "Database `{}` not found in data source `{}`",
            database_id,
            data_source_id
        ))?,
    };

    match database.get_schema(env.store.clone()).await {
        Ok(s) => Ok(s),
        Err(e) => Err(anyhow!(
            "Error getting schema for database `{}` in data source `{}`: {}",
            database_id,
            data_source_id,
            e
        )),
    }
}
