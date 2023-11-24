use crate::blocks::block::{parse_pair, Block, BlockResult, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;

use pest::iterators::Pair;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

use super::block::replace_variables_in_string;
use super::helpers::get_data_source_project;

#[derive(Clone)]
pub struct Database {
    query: String,
}

impl Database {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `database` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!(
                    "`expected` is not yet supported in `database` block"
                ))?,
                _ => unreachable!(),
            }
        }

        if !query.is_some() {
            Err(anyhow!("Missing required `query` in `database` block"))?;
        }

        Ok(Database {
            query: query.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Database {
    fn block_type(&self) -> BlockType {
        BlockType::Database
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("database_schema".as_bytes());
        hasher.update(self.query.as_bytes());
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
        `database` block `{}` expecting `{{ \"database\": \
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

        let query = replace_variables_in_string(&self.query, "query", env)?;
        let project = get_data_source_project(&workspace_id, &data_source_id, env).await?;

        let database = match env
            .store
            .load_database(&project, &data_source_id, &database_id)
            .await?
        {
            Some(d) => d,
            None => Err(anyhow!(
                "Database `{}` not found in data source `{}`",
                database_id,
                data_source_id
            ))?,
        };

        let (results, schema) = match database.query(env.store.clone(), &query).await {
            Ok(r) => r,
            Err(e) => Err(anyhow!(
                "Error querying database `{}` in data source `{}`: {}",
                database_id,
                data_source_id,
                e
            ))?,
        };

        Ok(BlockResult {
            value: json!({
                "results": results,
                "schema": schema,
            }),
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
