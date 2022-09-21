use crate::blocks::block::BlockType;
use crate::project::Project;
use crate::stores::{sqlite::SQLiteStore, store::Store};
use crate::utils;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{to_string_pretty, Value};
use std::collections::HashMap;

/// BlockExecution represents the execution of a block:
/// - `env` used
/// - `value` returned by successful execution
/// - `error` message returned by a failed execution
#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct BlockExecution {
    // pub env: Env,
    pub value: Option<Value>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct RunConfig {
    pub blocks: HashMap<String, Value>,
}

impl RunConfig {
    pub fn config_for_block(&self, name: &str) -> Option<&Value> {
        self.blocks.get(name)
    }

    pub async fn load(run_id: &str) -> Result<Self> {
        let root_path = utils::init_check().await?;
        let runs_dir = root_path.join(".runs");

        assert!(runs_dir.is_dir().await);
        let run_dir = runs_dir.join(run_id);

        if !run_dir.exists().await {
            Err(anyhow!("Run `{}` does not exist", run_id))?;
        }

        let config_path = run_dir.join("config.json");

        let config_data = async_std::fs::read_to_string(config_path).await?;
        let config: RunConfig = serde_json::from_str(&config_data)?;

        Ok(config)
    }
}

/// Execution represents the full execution of an app on input data.
#[derive(PartialEq, Debug)]
pub struct Run {
    run_id: String,
    created: u64,
    app_hash: String,
    config: RunConfig,
    // List of blocks (in order with name) and their execution.
    // The outer vector represents blocks
    // The inner-outer vector represents inputs
    // The inner-inner vector represents mapped outputs
    // If execution was interrupted by errors, the non-executed block won't be present. If a block
    // on a particular Env was not executed due to a conditional execution, its BlockExecution will
    // be present but both output and error will be None.
    // TODO(spolu): note that there is a lot of repetition here in particular through the env
    // variables, will need to be revisited but that's a fair enough starting point.
    pub traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)>,
}

impl Run {
    pub fn new(app_hash: &str, config: RunConfig) -> Self {
        Run {
            run_id: utils::new_id(),
            created: utils::now(),
            app_hash: app_hash.to_string(),
            config,
            traces: vec![],
        }
    }

    /// Creates a new Run object in memory from raw data (used by Store implementations)
    pub fn new_from_store(
        run_id: &str,
        created: u64,
        app_hash: &str,
        config: &RunConfig,
        traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)>,
    ) -> Self {
        Run {
            run_id: run_id.to_string(),
            created,
            app_hash: app_hash.to_string(),
            config: config.clone(),
            traces,
        }
    }

    pub fn run_id(&self) -> &str {
        &self.run_id
    }

    pub fn created(&self) -> u64 {
        self.created
    }

    pub fn app_hash(&self) -> &str {
        &&self.app_hash
    }

    pub fn config(&self) -> &RunConfig {
        &self.config
    }
}

pub async fn cmd_inspect(run_id: &str, block: &str) -> Result<()> {
    let root_path = utils::init_check().await?;
    let store = SQLiteStore::new(root_path.join("store.sqlite"))?;
    store.init().await?;
    let project = Project::new_from_id(0);

    let mut run_id = run_id.to_string();

    if run_id == "latest" {
        run_id = match store.latest_run_id(&project).await? {
            Some(run_id) => run_id,
            None => Err(anyhow!("No run found, the app was never executed"))?,
        };
        utils::info(&format!("Latest run is `{}`", run_id));
    }

    let run = match store.load_run(&project, &run_id).await? {
        Some(r) => r,
        None => Err(anyhow!("Run with id {} not found", run_id))?,
    };

    let mut found = false;
    run.traces.iter().for_each(|((_, name), input_executions)| {
        if name == block {
            input_executions
                .iter()
                .enumerate()
                .for_each(|(input_idx, map_executions)| {
                    map_executions
                        .iter()
                        .enumerate()
                        .for_each(|(map_idx, execution)| {
                            found = true;
                            utils::info(&format!(
                                "Execution: input_idx={}/{} map_idx={}/{}",
                                input_idx,
                                input_executions.len(),
                                map_idx,
                                map_executions.len()
                            ));
                            match execution.value.as_ref() {
                                Some(v) => println!("{}", to_string_pretty(v).unwrap()),
                                None => {}
                            }
                            match execution.error.as_ref() {
                                Some(e) => utils::error(&format!("Error: {}", e)),
                                None => {}
                            }
                        });
                });
        }
    });

    if !found {
        Err(anyhow!("Block `{}` not found in run `{}`", block, run_id))?;
    }

    Ok(())
}

pub async fn cmd_list() -> Result<()> {
    let root_path = utils::init_check().await?;
    let store = SQLiteStore::new(root_path.join("store.sqlite"))?;
    store.init().await?;
    let project = Project::new_from_id(0);

    store
        .all_runs(&project)
        .await?
        .iter()
        .for_each(|(run_id, created, app_hash, _config)| {
            utils::info(&format!(
                "Run: {} app_hash={} created={}",
                run_id,
                app_hash,
                utils::utc_date_from(*created),
            ));
        });

    Ok(())
}
