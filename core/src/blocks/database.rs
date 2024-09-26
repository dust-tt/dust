use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::{
    blocks::{
        block::{parse_pair, replace_variables_in_string, Block, BlockResult, BlockType, Env},
        database_schema::load_tables_from_identifiers,
    },
    databases::database::{execute_query, QueryDatabaseError},
    Rule,
};

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
            "Invalid or missing `tables` in configuration for \
        `database` block `{}` expecting `{{ \"tables\": \
        [ {{ \"workspace_id\": ..., \"data_source_id\": ..., \"table_id\": ... }}, ... ] }}`",
            name
        );

        let table_identifiers = match config {
            Some(v) => match v.get("tables") {
                Some(Value::Array(a)) => a
                    .iter()
                    .map(|v| {
                        let workspace_id = match v.get("workspace_id") {
                            Some(Value::String(s)) => s,
                            _ => Err(anyhow!(err_msg.clone()))?,
                        };
                        let data_source_id = match v.get("data_source_id") {
                            Some(Value::String(s)) => s,
                            _ => Err(anyhow!(err_msg.clone()))?,
                        };
                        let table_id = match v.get("table_id") {
                            Some(Value::String(s)) => s,
                            _ => Err(anyhow!(err_msg.clone()))?,
                        };

                        Ok((workspace_id, data_source_id, table_id))
                    })
                    .collect::<Result<Vec<_>>>()?,
                _ => Err(anyhow!(err_msg.clone()))?,
            },
            _ => Err(anyhow!(err_msg.clone()))?,
        };

        let query = replace_variables_in_string(&self.query, "query", env)?;
        let tables = load_tables_from_identifiers(&table_identifiers, env).await?;

        match execute_query(&tables, &query, env.store.clone()).await {
            Ok((results, schema)) => Ok(BlockResult {
                value: json!({
                    "results": results,
                    "schema": schema,
                }),
                meta: None,
            }),
            Err(e) => match &e {
                // If the actual query failed, we don't fail the block, instead we return a block result with an error inside.
                QueryDatabaseError::ExecutionError(s) => Ok(BlockResult {
                    value: json!({
                        "error": s,
                    }),
                    meta: None,
                }),
                // We don't have a proper way to return a typed error from a block, so we just return a generic error with a string.
                // We expect the frontend to match the error code.
                QueryDatabaseError::TooManyResultRows => Err(anyhow!("too_many_result_rows")),
                _ => Err(e.into()),
            },
        }
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
