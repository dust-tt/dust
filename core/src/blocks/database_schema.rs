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
    databases::{
        table::{LocalTable, Table},
        transient_database::get_unique_table_names_for_transient_database,
    },
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

                        Ok((workspace_id, data_source_id, table_id))
                    })
                    .collect::<Result<Vec<_>>>()?,
                _ => Err(anyhow!(err_msg.clone()))?,
            },
            _ => Err(anyhow!(err_msg.clone()))?,
        };

        let tables = load_tables_from_identifiers(&table_identifiers, env).await?;

        // Compute the unique table names for each table.
        let unique_table_names = get_unique_table_names_for_transient_database(&tables);

        // TODO(SNOWFLAKE): add support for remote databases
        // Check that all tables are local tables and create a "LocalTable" for each.
        let mut local_tables = tables
            .into_iter()
            .map(|t| LocalTable::from_table(t))
            .collect::<Result<Vec<_>>>()?;

        // Load the schema for each table.
        // If the schema cache is stale, this will update it in place.
        try_join_all(
            local_tables
                .iter_mut()
                .map(|t| t.schema(env.store.clone(), env.databases_store.clone())),
        )
        .await?;

        Ok(BlockResult {
            value: serde_json::to_value(
                local_tables
                    .into_iter()
                    .map(|t| {
                        let unique_table_name = unique_table_names
                            .get(&t.table.unique_id())
                            .expect("Unreachable: missing unique table name.");
                        json!({
                            "table_schema": t.table.schema_cached(),
                            "dbml": t.render_dbml(Some(&unique_table_name)),
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

pub async fn load_tables_from_identifiers(
    table_identifiers: &Vec<(&String, &String, &String)>,
    env: &Env,
) -> Result<Vec<Table>> {
    // Get a vec of unique (workspace_id, data_source_id) pairs.
    let data_source_identifiers = table_identifiers
        .iter()
        .map(|(workspace_id, data_source_or_view_id, _)| (*workspace_id, *data_source_or_view_id))
        .unique()
        .collect::<Vec<_>>();

    // Get a vec of the corresponding project ids for each (workspace_id, data_source_id) pair.
    let project_ids_view_filters = try_join_all(data_source_identifiers.iter().map(
        |(workspace_id, data_source_or_view_id)| {
            get_data_source_project_and_view_filter(workspace_id, data_source_or_view_id, env)
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
        |(workspace_id, data_source_or_view_id, table_id)| {
            let (project, data_source_name) = project_and_data_source_by_data_source_view
                .get(&(*workspace_id, *data_source_or_view_id))
                .expect("Unreachable: missing project.");
            store.load_table(&project, &data_source_name, &table_id)
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
