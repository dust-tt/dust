use anyhow::{anyhow, Ok, Result};
use async_trait::async_trait;
use futures::future::try_join_all;
use itertools::Itertools;
use pest::iterators::Pair;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::{
    blocks::{
        block::{Block, BlockResult, BlockType, Env},
        helpers::get_data_source_project_and_view_filter,
    },
    databases::{database::get_tables_schema, table::Table},
    Rule,
};

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
            "Invalid or missing `tables` in configuration for \
        `database_schema` block `{}` expecting `{{ \"tables\": \
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
                        let remote_database_secret_id = match v.get("remote_database_secret_id") {
                            Some(Value::String(s)) => Some(s),
                            _ => None,
                        };
                        Ok((
                            workspace_id,
                            data_source_id,
                            table_id,
                            remote_database_secret_id,
                        ))
                    })
                    .collect::<Result<Vec<_>>>()?,
                _ => Err(anyhow!(err_msg.clone()))?,
            },
            _ => Err(anyhow!(err_msg.clone()))?,
        };

        let tables = load_tables_from_identifiers(&table_identifiers, env).await?;

        // Compute the unique table names for each table.

        let (dialect, schemas) =
            get_tables_schema(tables, env.store.clone(), env.databases_store.clone()).await?;

        Ok(BlockResult {
            value: serde_json::to_value(
                schemas
                    .iter()
                    .map(
                        |s| json!({ "table_schema": s.schema, "dbml": s.dbml, "dialect": dialect, "head": s.head }),
                    )
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

pub async fn load_tables_from_identifiers(
    table_identifiers: &Vec<(&String, &String, &String, Option<&String>)>,
    env: &Env,
) -> Result<Vec<Table>> {
    // Get a vec of unique (workspace_id, data_source_id) pairs.
    let data_source_identifiers = table_identifiers
        .iter()
        .map(|(workspace_id, data_source_or_view_id, _, _)| {
            (*workspace_id, *data_source_or_view_id)
        })
        .unique()
        .collect::<Vec<_>>();

    let is_system_run = env.credentials.get("DUST_IS_SYSTEM_RUN") == Some(&String::from("true"));

    // Get a vec of the corresponding project ids for each (workspace_id, data_source_id) pair.
    let project_ids_view_filters = try_join_all(data_source_identifiers.iter().map(
        |(workspace_id, data_source_or_view_id)| {
            get_data_source_project_and_view_filter(
                workspace_id,
                data_source_or_view_id,
                env,
                is_system_run,
            )
        },
    ))
    .await?;

    // Create a hashmap of (workspace_id, data_source_id) -> project_id.
    let project_and_data_source_by_data_source_view = data_source_identifiers
        .iter()
        .zip(project_ids_view_filters.iter())
        .map(
            |((workspace_id, data_source_or_view_id), (project, _, data_source_name))| {
                (
                    (*workspace_id, *data_source_or_view_id),
                    (project, data_source_name),
                )
            },
        )
        .collect::<std::collections::HashMap<_, _>>();

    let filters_by_project = project_ids_view_filters
        .iter()
        .filter_map(|(_, filter, data_source_name)| {
            filter
                .as_ref()
                .map(|filter| (data_source_name.as_str(), filter.clone()))
        })
        .collect::<std::collections::HashMap<_, _>>();

    let store = env.store.clone();

    // Concurrently load all tables.
    (try_join_all(table_identifiers.iter().map(
        |(workspace_id, data_source_or_view_id, table_id, remote_database_secret_id)| async {
            let table_id = *table_id;
            let remote_database_secret_id = *remote_database_secret_id;
            let (project, data_source_name) = project_and_data_source_by_data_source_view
                .get(&(*workspace_id, *data_source_or_view_id))
                .expect("Unreachable: missing project.");
            let mut table = store
                .load_data_source_table(&project, &data_source_name, &table_id)
                .await?;
            if let (Some(table), Some(secret_id)) = (table.as_mut(), remote_database_secret_id) {
                table.set_remote_database_secret_id(secret_id.to_string());
            }
            Ok(table)
        },
    ))
    .await?)
        // Unwrap the results.
        .into_iter()
        .filter(|t| {
            t.as_ref().map_or(true, |table| {
                filters_by_project
                    .get(&table.data_source_id())
                    .map_or(true, |filter| filter.match_filter(table))
            })
        })
        .map(|t| t.ok_or_else(|| anyhow!("Table not found.")))
        .collect()
}
