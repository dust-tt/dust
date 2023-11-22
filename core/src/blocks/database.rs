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
    workspace_id: String,
    data_source_id: String,
    database_id: String,
}

impl Database {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;
        let mut workspace_id: Option<String> = None;
        let mut data_source_id: Option<String> = None;
        let mut database_id: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        "workspace_id" => workspace_id = Some(value),
                        "data_source_id" => data_source_id = Some(value),
                        "database_id" => database_id = Some(value),
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
        if !workspace_id.is_some() {
            Err(anyhow!(
                "Missing required `workspace_id` in `database` block"
            ))?;
        }
        if !data_source_id.is_some() {
            Err(anyhow!(
                "Missing required `data_source_id` in `database` block"
            ))?;
        }
        if !database_id.is_some() {
            Err(anyhow!(
                "Missing required `database_id` in `database` block"
            ))?;
        }

        Ok(Database {
            query: query.unwrap(),
            workspace_id: workspace_id.unwrap(),
            data_source_id: data_source_id.unwrap(),
            database_id: database_id.unwrap(),
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
        hasher.update(self.data_source_id.as_bytes());
        hasher.update(self.database_id.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        let workspace_id = replace_variables_in_string(&self.workspace_id, "workspace_id", env)?;
        let data_source_id =
            replace_variables_in_string(&self.data_source_id, "data_source_id", env)?;
        let database_id = replace_variables_in_string(&self.database_id, "database_id", env)?;

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

        let (rows, schema) = match database
            .query(&project, env.store.clone(), &self.query)
            .await
        {
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
                "rows": rows,
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
