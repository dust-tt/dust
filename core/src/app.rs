use crate::blocks::block::{parse_block, Block, BlockResult, BlockType, Env, InputState, MapState};
use crate::data_sources::qdrant::QdrantClients;
use crate::databases_store::store::DatabasesStore;
use crate::dataset::Dataset;
use crate::project::Project;
use crate::run::{
    BlockExecution, BlockStatus, Credentials, Run, RunConfig, RunType, Secrets, Status,
};
use crate::stores::store::Store;
use crate::utils;
use crate::{DustParser, Rule};
use anyhow::{anyhow, Result};
use futures::StreamExt;
use futures::TryStreamExt;
use parking_lot::Mutex;
use pest::Parser;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;
use tokio_stream::{self as stream};
use tracing::{error, info};

/// An App is a collection of versioned Blocks.
///
/// Blocks are versioned by their hash (inner_hash) and the hash of their predecessor in the App
/// specification. The App hash is computed from its constituting blocks hashes.
pub struct App {
    // Specification state.
    hash: String,
    blocks: Vec<(String, String, Box<dyn Block + Send + Sync>)>, // (hash, name, Block)
    // Run state.
    run: Option<Run>,
    project: Option<Project>,
    run_config: Option<RunConfig>,
    dataset: Option<Dataset>,
}

impl App {
    pub fn len(&self) -> usize {
        self.blocks.len()
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub fn run_ref(&self) -> Option<&Run> {
        self.run.as_ref()
    }

    pub fn blocks(&self) -> Vec<(BlockType, String)> {
        self.blocks
            .iter()
            .map(|(_, name, block)| (block.block_type(), name.clone()))
            .collect()
    }

    pub fn has_input(&self) -> bool {
        self.blocks
            .iter()
            .any(|(_, _, block)| block.block_type() == BlockType::Input)
    }

    pub async fn new(spec_data: &str) -> Result<Self> {
        let parsed = DustParser::parse(Rule::dust, &spec_data)?.next().unwrap();

        // Block names and parsed instantiations.
        let mut blocks: Vec<(String, Box<dyn Block + Send + Sync>)> = Vec::new();

        for pair in parsed.into_inner() {
            match pair.as_rule() {
                Rule::block => {
                    let mut block_type: Option<BlockType> = None;
                    let mut block_name: Option<String> = None;
                    for pair in pair.into_inner() {
                        match pair.as_rule() {
                            Rule::block_type => {
                                block_type = Some(BlockType::from_str(pair.as_str())?);
                            }
                            Rule::block_name => {
                                block_name = Some(pair.as_str().to_string());
                            }
                            Rule::block_body => {
                                assert!(block_type.as_ref().is_some());
                                assert!(block_name.as_ref().is_some());

                                blocks.push((
                                    block_name.as_ref().unwrap().clone(),
                                    parse_block(block_type.unwrap(), pair)?,
                                ));
                            }
                            _ => unreachable!(),
                        }
                    }
                }
                Rule::EOI => {}
                _ => unreachable!(),
            }
        }

        // Check that:
        // - there is at most one input.
        // - `map`s are matched by a `reduce` and that they are not nested.
        // - `while`s are matched by a `end` and they are not nested.
        // - `map`/`reduce` and `while`/`end` are not nested.
        // - blocks don't share the same name, except for `map/reduce` and `while/end` pairs.
        let mut current_map: Option<String> = None;
        let mut current_while: Option<String> = None;
        let mut input_found = false;
        let mut block_types_by_name: HashMap<String, HashSet<BlockType>> = HashMap::new();

        for (name, block) in &blocks {
            if block.block_type() == BlockType::Input {
                if input_found {
                    Err(anyhow!(
                        "Extraneous `input {}` block, only one input block is allowed",
                        name
                    ))?;
                }
                if current_map.is_some() {
                    Err(anyhow!(
                        "Block `input {}` is nested in `map {}` which is invalid.",
                        name,
                        current_map.as_ref().unwrap()
                    ))?;
                }
                if current_while.is_some() {
                    Err(anyhow!(
                        "Block `input {}` is nested in `while {}` which is invalid.",
                        name,
                        current_map.as_ref().unwrap()
                    ))?;
                }
                input_found = true;
            }
            if block.block_type() == BlockType::Map {
                if current_while.is_some() {
                    Err(anyhow!(
                        "Nested maps and while blocks are not currently supported, \
                         found `map {}` nested in `while {}`",
                        name,
                        current_while.as_ref().unwrap()
                    ))?;
                }
                if current_map.is_some() {
                    Err(anyhow!(
                        "Nested maps are not currently supported, \
                         found `map {}` nested in `map {}`",
                        name,
                        current_map.as_ref().unwrap()
                    ))?;
                }
                current_map = Some(name.clone());
            }
            if block.block_type() == BlockType::While {
                if current_map.is_some() {
                    Err(anyhow!(
                        "Nested maps and while blocks are not currently supported, \
                         found `while {}` nested in `map {}`",
                        name,
                        current_map.as_ref().unwrap()
                    ))?;
                }
                if current_while.is_some() {
                    Err(anyhow!(
                        "Nested while are not currently supported, \
                         found `while {}` nested in `while {}`",
                        name,
                        current_while.as_ref().unwrap()
                    ))?;
                }
                current_while = Some(name.clone());
            }
            if block.block_type() == BlockType::Reduce {
                match current_map.as_ref() {
                    None => {
                        Err(anyhow!(
                            "Block `reduce {}` is not matched by a previous `map {}` block",
                            name.as_str(),
                            name.as_str()
                        ))?;
                    }
                    Some(map) => {
                        if map.as_str() != name.as_str() {
                            Err(anyhow!(
                                "Block `reduce {}` does not match the current `map {}` block",
                                name.as_str(),
                                map.as_str()
                            ))?;
                        } else {
                            current_map = None;
                        }
                    }
                }
            }
            if block.block_type() == BlockType::End {
                match current_while.as_ref() {
                    None => {
                        Err(anyhow!(
                            "Block `end {}` is not matched by a previous `while {}` block",
                            name.as_str(),
                            name.as_str()
                        ))?;
                    }
                    Some(w) => {
                        if w.as_str() != name.as_str() {
                            Err(anyhow!(
                                "Block `end {}` does not match the current `while {}` block",
                                name.as_str(),
                                w.as_str()
                            ))?;
                        } else {
                            current_while = None;
                        }
                    }
                }
            }

            // check that blocks don't share the same name, except for `map/reduce` and `while/end`
            if let Some(block_types) = block_types_by_name.get_mut(name) {
                // there is already at least one block with this name
                if block_types.len() > 1 // More than 2 blocks with the same name is never valid.
                // 2 blocks with the same name is OK if they are `map`/`reduce` or `while`/`end`
                    || !((block.block_type() == BlockType::End
                        && block_types.contains(&BlockType::While))
                        || (block.block_type() == BlockType::Reduce
                            && block_types.contains(&BlockType::Map)))
                {
                    Err(anyhow!(
                        "Found multiple blocks with the same name `{}`.",
                        name
                    ))?
                } else {
                    block_types.insert(block.block_type());
                }
            } else {
                // first block with this name
                block_types_by_name
                    .insert(name.clone(), vec![block.block_type()].into_iter().collect());
            }
        }

        // At this point the app looks valid (of course code blocks can fail in arbitrary ways).
        // Let's compute the hash of each block and the hash of the app.
        let mut hashes: Vec<String> = Vec::new();
        let mut prev_hash: String = "".to_string();
        for (name, block) in &blocks {
            let mut hasher = blake3::Hasher::new();
            hasher.update(prev_hash.as_bytes());
            hasher.update(name.as_bytes());
            hasher.update(block.inner_hash().as_bytes());
            prev_hash = format!("{}", hasher.finalize().to_hex());
            hashes.push(prev_hash.clone());
        }

        Ok(App {
            hash: prev_hash,
            blocks: blocks
                .into_iter()
                .zip(hashes.into_iter())
                .map(|((name, block), hash)| (hash, name, block))
                .collect(),
            run: None,
            project: None,
            run_config: None,
            dataset: None,
        })
    }

    pub async fn prepare_run(
        &mut self,
        run_type: RunType,
        run_config: RunConfig,
        project: Project,
        dataset: Option<Dataset>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<()> {
        assert!(self.run.is_none());

        self.project = Some(project);
        self.run_config = Some(run_config);
        self.dataset = dataset;

        if self.dataset.is_none() && self.has_input() {
            Err(anyhow!("Found input block but no dataset was provided"))?;
        }

        let store = store.clone();
        self.run = Some(Run::new(
            run_type,
            &self.hash,
            self.run_config.as_ref().unwrap().clone(),
        ));

        store
            .as_ref()
            .create_run_empty(self.project.as_ref().unwrap(), self.run.as_ref().unwrap())
            .await?;

        Ok(())
    }

    pub async fn run(
        &mut self,
        credentials: Credentials,
        secrets: Secrets,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        qdrant_clients: QdrantClients,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<()> {
        assert!(self.run.is_some());
        assert!(self.run_config.is_some());
        assert!(self.project.is_some());

        let project = self.project.as_ref().unwrap().clone();
        let run_id = self.run.as_ref().unwrap().run_id().to_string();

        info!(
            project_id = project.project_id(),
            run_id = run_id.as_str(),
            "Starting run"
        );

        // Send an event for the initial run status.
        match event_sender.as_ref() {
            Some(sender) => {
                let _ = sender.send(json!({
                    "type": "run_status",
                    "content": {
                        "status": Status::Running,
                        "run_id": run_id,
                    }
                }));
            }
            None => (),
        };

        // Initialize the ExecutionEnv. Blocks executed before the input block is found are executed
        // only once instead of once per input data.
        let mut envs = vec![vec![Env {
            config: self.run_config.as_ref().unwrap().clone(),
            state: HashMap::new(),
            input: InputState {
                value: None,
                index: 0,
            },
            map: None,
            project: project.clone(),
            store: store.clone(),
            databases_store: databases_store.clone(),
            qdrant_clients: qdrant_clients,
            credentials: credentials.clone(),
            secrets: secrets.clone(),
            run_id: run_id.clone(),
        }]];

        let mut current_map: Option<String> = None;
        let mut current_map_blocks: Vec<String> = vec![];

        let mut current_while: Option<usize> = None;
        let mut current_while_iteration: Option<usize> = None;
        let mut current_skips: Option<Vec<bool>> = None;

        let mut block_idx = 0;

        // for (_, name, block) in &self.blocks {
        while block_idx < self.blocks.len() {
            let time_block_start = utils::now();
            let (_, name, block) = &self.blocks[block_idx];

            // Special pre-processing of the input block, injects data as input and build
            // input_envs.
            if block.block_type() == BlockType::Input {
                assert!(envs.len() == 1 && envs[0].len() == 1);
                envs = self
                    .dataset
                    .as_ref()
                    .unwrap()
                    .iter()
                    .enumerate()
                    .map(|(i, d)| {
                        vec![Env {
                            input: InputState {
                                value: Some(d.clone()),
                                index: i,
                            },
                            ..envs[0][0].clone()
                        }]
                    })
                    .collect::<Vec<_>>();
            }

            // Special post-processing of while blocks, if not already in the while loop, mark that
            // we're in a while loop by setting `current_while`. This means we'll aggregate block
            // results as arrays instead of values in the `env.state`.
            if block.block_type() == BlockType::While {
                match current_while {
                    Some(w) => {
                        assert!(w == block_idx);
                        current_while_iteration = Some(current_while_iteration.unwrap() + 1);
                    }
                    None => {
                        current_while = Some(block_idx);
                        current_skips = Some(envs.iter().map(|_| false).collect());
                        current_while_iteration = Some(0);
                    }
                }
                envs = envs
                    .iter()
                    .map(|map_envs| {
                        assert!(map_envs.len() == 1);
                        let mut env = map_envs[0].clone();
                        env.map = Some(MapState {
                            name: name.clone(),
                            iteration: current_while_iteration.unwrap(),
                        });
                        vec![env]
                    })
                    .collect();
            }

            // Special pre-processing for reduce blocks. Reduce the envs of the blocks that were
            // executed as part of the map. If the env does not include an output we fail
            // conservatively for now.
            // TODO(spolu): re-evaluate or maybe parametrize behavior in maps. If we allow errors to
            // go through we have an alignment problem if future blocks use elements from different
            // blocks in the map assuming they are aligned. We would probably need to use
            // Value::None?
            if block.block_type() == BlockType::Reduce {
                assert!(current_map.is_some());
                envs =
                    envs.iter()
                        .map(|map_envs| {
                            assert!(map_envs.len() > 0);
                            let mut env = map_envs[0].clone();
                            current_map_blocks
                                .iter()
                                .map(|n| {
                                    env.state.insert(
                                        n.clone(),
                                        Value::Array(
                                            map_envs
                                                .iter()
                                                .map(|e| match e.state.get(n) {
                                                    None => Err(anyhow!(
                                                    "Missing block `{}` output, at iteration {}",
                                                    n, e.map.as_ref().unwrap().iteration
                                                ))?,
                                                    Some(v) => Ok(v.clone()),
                                                })
                                                .collect::<Result<Vec<_>>>()?,
                                        ),
                                    );
                                    Ok(())
                                })
                                .collect::<Result<Vec<_>>>()?;
                            env.map = None;
                            Ok(vec![env])
                        })
                        .collect::<Result<Vec<_>>>()?;

                current_map = None;
                current_map_blocks = vec![];
            }

            // Create a protected clone of the status during execution of the block to update the
            // block status as execution takes place and push it to DB.
            let run_status = Arc::new(Mutex::new(self.run.as_ref().unwrap().status().clone()));

            // Create a new block status, add it to the current run status and update the DB then
            // project the block_status for update each time a worker finishes.
            let block_status = BlockStatus {
                block_type: block.block_type(),
                name: name.to_string(),
                status: Status::Running,
                success_count: 0,
                error_count: 0,
            };
            self.run
                .as_mut()
                .unwrap()
                .set_block_status(block_status.clone());
            store
                .update_run_status(&project, &run_id, self.run.as_ref().unwrap().status())
                .await?;

            // Send an event for the inital block execution status.
            match event_sender.as_ref() {
                Some(sender) => {
                    let _ = sender.send(json!({
                        "type": "block_status",
                        "content": block_status.clone(),
                    }));
                }
                None => (),
            };

            let block_status = Arc::new(Mutex::new(block_status));

            // We flatten the envs for concurrent and parrallel execution of the block which
            // requires us to keep track of the potential input and map indices of each Env,
            // depending on the state of ExecutionEnvs.
            let e = stream::iter(
                envs.iter()
                    .cloned()
                    .enumerate()
                    .map(|(input_idx, map_envs)| {
                        map_envs
                            .into_iter()
                            .enumerate()
                            .map(move |(map_idx, env)| (input_idx, map_idx, name.clone(), env))
                    })
                    .flatten(),
            )
            .map(|(input_idx, map_idx, name, e)| {
                // `block.clone()` calls the implementation of Clone on Box<dyn Block + ...>
                // that calls into the Block#[serde(skip_serializing)] trait's `clone_box`
                // implemented on each Block. This allows cloning the Block (as a Trait) to use from
                // parallel threads!
                let b = block.clone();
                let run_status = run_status.clone();
                let block_status = block_status.clone();
                let store = store.clone();
                let project = project.clone();
                let run_id = run_id.clone();
                let event_sender = event_sender.clone();
                let skip = match current_skips {
                    Some(ref skips) => skips[input_idx],
                    None => false,
                };
                tokio::spawn(async move {
                    match skip {
                        false => match b.execute(&name, &e, event_sender).await {
                            Ok(v) => {
                                let block_status = {
                                    let mut block_status = block_status.lock();
                                    block_status.success_count += 1;
                                    block_status.clone()
                                };
                                let run_status = {
                                    let mut run_status = run_status.lock();
                                    run_status.set_block_status(block_status);
                                    run_status.clone()
                                };
                                store
                                    .update_run_status(&project, &run_id, &run_status)
                                    .await?;
                                Ok((input_idx, map_idx, e, Ok(v)))
                                    as Result<
                                        (usize, usize, Env, Result<BlockResult, anyhow::Error>),
                                        anyhow::Error,
                                    >
                            }
                            Err(err) => {
                                let block_status = {
                                    let mut block_status = block_status.lock();
                                    block_status.error_count += 1;
                                    block_status.clone()
                                };
                                let run_status = {
                                    let mut run_status = run_status.lock();
                                    run_status.set_block_status(block_status);
                                    run_status.clone()
                                };
                                store
                                    .update_run_status(&project, &run_id, &run_status)
                                    .await?;
                                Ok((input_idx, map_idx, e, Err(err)))
                            }
                        },
                        true => Ok((
                            input_idx,
                            map_idx,
                            e,
                            Ok(BlockResult {
                                value: Value::Null,
                                meta: None,
                            }),
                        ))
                            as Result<
                                (usize, usize, Env, Result<BlockResult, anyhow::Error>),
                                anyhow::Error,
                            >,
                    }
                })
            })
            .buffer_unordered(
                self.run_config
                    .as_ref()
                    .unwrap()
                    .concurrency_for_block(block.block_type(), name),
            )
            .map(|r| match r {
                Err(e) => Err(anyhow!("Block execution spawn error: {}", e))?,
                Ok(r) => r,
            })
            .try_collect::<Vec<_>>()
            .await?;

            // Flatten the result and extract results (Env, Value) or error strings.
            let mut flat: Vec<Vec<Option<(Env, Option<BlockResult>, Option<String>)>>> =
                envs.iter().map(|e| vec![None; e.len()]).collect::<Vec<_>>();

            let mut errors: Vec<String> = vec![];
            let mut success = 0_usize;
            e.into_iter().for_each(|(input_idx, map_idx, e, r)| {
                match r {
                    Ok(v) => {
                        flat[input_idx][map_idx] = Some((e, Some(v), None));
                        success += 1;
                    }
                    Err(err) => {
                        errors.push(err.to_string());
                        flat[input_idx][map_idx] = Some((e, None, Some(err.to_string())));
                    }
                };
            });

            let trace = (
                (block.block_type(), name.clone()),
                flat.iter()
                    .map(|m| {
                        m.iter()
                            .map(|o| match o {
                                Some(r) => match r {
                                    (_, Some(v), None) => BlockExecution {
                                        value: Some(v.value.clone()),
                                        error: None,
                                        meta: v.meta.clone(),
                                    },
                                    (_, None, Some(err)) => BlockExecution {
                                        value: None,
                                        error: Some(err.clone()),
                                        meta: None,
                                    },
                                    _ => unreachable!(),
                                },
                                None => unreachable!(),
                            })
                            .collect::<Vec<_>>()
                    })
                    .collect::<Vec<_>>(),
            );

            // Send an event for the block execution trace. Note that when inside a `while` loop
            // that means we'll send a trace event with map_idx = 0 for each iteration.
            match event_sender.as_ref() {
                Some(sender) => {
                    let _ = sender.send(json!({
                        "type": "block_execution",
                        "content": {
                            "block_type": trace.0.0,
                            "block_name": trace.0.1,
                            "execution": trace.1,
                        }
                    }));
                }
                None => (),
            };

            // Update the run traces (before updating DB with `apend_run_block`). If we are inside a
            // `while` loop we unpack the past iterations results along the `map_idx` and go update
            // the traces manually. Otherwise, we just append the trace to the run object as
            // execution is linear.
            match current_while {
                Some(_) => {
                    // First thing to do is to clone and transform `t` to remove block executions
                    // that are skipped (they have a null value) so that they don't get accumulated
                    // after the `while` condition started returning false.
                    assert!(
                        current_skips.is_some()
                            && trace.1.len() == current_skips.as_ref().unwrap().len()
                    );
                    let mut t = trace.clone();
                    t.1.iter_mut()
                        .zip(current_skips.as_ref().unwrap().iter())
                        .for_each(|(m, skipped)| {
                            assert!(m.len() == 1);
                            if *skipped {
                                m.pop();
                            }
                        });

                    match current_while_iteration {
                        Some(0) => {
                            // If we are inside a `while` loop and this is the first iteration, we
                            // insert the trace normally.
                            self.run.as_mut().unwrap().traces.push(t);
                        }
                        _ => {
                            // If we are inside a `while` loop, we append the current trace along the
                            // `map_idx` dimension to the run's existing traces for that block.
                            self.run
                                .as_mut()
                                .unwrap()
                                .traces
                                .iter_mut()
                                .for_each(|(k, v)| {
                                    if k.0 == t.0 .0 && k.1 == t.0 .1 {
                                        v.iter_mut().zip(t.1.iter()).for_each(|(r, n)| {
                                            match n.len() {
                                                // skipped
                                                0 => (),
                                                // effectively run
                                                1 => {
                                                    r.push(n[0].clone());
                                                }
                                                _ => unreachable!(),
                                            }
                                        })
                                    }
                                });
                        }
                    }
                }
                None => {
                    self.run.as_mut().unwrap().traces.push(trace);
                }
            }

            // Update block run executions incrementally. Note that when we're in a `while` loop,
            // the entire trace for the block will be rewritten which is the most efficient.
            store
                .as_ref()
                .append_run_block(
                    &project,
                    self.run.as_ref().unwrap(),
                    block_idx,
                    &block.block_type(),
                    name,
                )
                .await?;

            info!(
                block_type = block.block_type().to_string(),
                block_name = name.as_str(),
                successes = success,
                errors = errors.len(),
                duration = utils::now() - time_block_start,
                "Execution block"
            );

            // Update the run_status for next iteration, finalize block_status, write to DB
            let block_status = {
                let mut block_status = block_status.lock();
                block_status.status = match errors.len() {
                    0 => Status::Succeeded,
                    _ => Status::Errored,
                };
                block_status.clone()
            };
            let run_status = {
                let mut run_status = run_status.lock();
                run_status.set_block_status(block_status.clone());
                if errors.len() > 0 {
                    run_status.set_run_status(Status::Errored);
                }
                run_status.clone()
            };
            self.run.as_mut().unwrap().set_status(run_status);
            store
                .as_ref()
                .update_run_status(&project, &run_id, self.run.as_ref().unwrap().status())
                .await?;

            // Send an event for the updated block execution status.
            match event_sender.as_ref() {
                Some(sender) => {
                    let _ = sender.send(json!({
                        "type": "block_status",
                        "content": block_status.clone(),
                    }));
                }
                None => (),
            };

            // If errors were encountered, interrupt execution.
            if errors.len() > 0 {
                errors.iter().for_each(|e| error!(error = e, "Run error"));
                info!(
                    run = run_id.as_str(),
                    app_version = self.run.as_ref().unwrap().app_hash(),
                    "Run stored"
                );

                // Send an event for the run status update.
                match event_sender.as_ref() {
                    Some(sender) => {
                        let _ = sender.send(json!({
                            "type": "run_status",
                            "content": {
                                "status": Status::Errored,
                                "run_id": run_id,
                            }
                        }));
                    }
                    None => (),
                };

                Err(anyhow!(
                    "Run `{}` for app version `{}` interrupted due to \
                     failed execution of block `{} {}` with {} error(s)",
                    &run_id,
                    self.run.as_ref().unwrap().app_hash(),
                    block.block_type().to_string(),
                    name,
                    errors.len(),
                ))?;
            }

            // There was no error so all envs can be updated and written in the mutable `envs`.
            flat.into_iter().enumerate().for_each(|(input_idx, m)| {
                m.into_iter().enumerate().for_each(|(map_idx, r)| match r {
                    Some(r) => match r {
                        (mut e, Some(v), _) => {
                            // Finally update the environment with the block execution result and
                            // prepare the next loop `envs` object.
                            match current_while {
                                // We're outside a `while` loop, simply set the value.
                                None => {
                                    // Note that if the block type is `reduce` this will override in
                                    // the state the value for the `map` type since they have the
                                    // same name. This is fine as this is not super useful
                                    // information as it's repetitive.
                                    e.state.insert(name.clone(), v.value);
                                }
                                // We're inside a `while` loop, accumulate value in `env.state` as
                                // an array.
                                Some(_) => {
                                    // We don't insert a value if the block type is `end` as `while`
                                    // and `end` have the same name so this would lead to a
                                    // alternation of boolean (`while` output) and null (`end`
                                    // output).
                                    if block.block_type() != BlockType::End {
                                        assert!(
                                            current_skips.is_some()
                                                && envs.len()
                                                    == current_skips.as_ref().unwrap().len()
                                        );

                                        match current_skips.as_ref().unwrap().get(input_idx) {
                                            Some(false) => {
                                                match e.state.get(name) {
                                                    Some(Value::Array(arr)) => {
                                                        let mut arr = arr.clone();
                                                        arr.push(v.value.clone());
                                                        e.state.insert(
                                                            name.clone(),
                                                            Value::Array(arr),
                                                        );
                                                    }
                                                    None => {
                                                        e.state.insert(
                                                            name.clone(),
                                                            Value::Array(vec![v.value]),
                                                        );
                                                    }
                                                    _ => unreachable!(),
                                                };
                                            }
                                            Some(true) => {
                                                // Do not aggregate value, but if we are skipped and
                                                // there is nothing yet, insert the empty array.
                                                match e.state.get(name) {
                                                    None => {
                                                        e.state.insert(
                                                            name.clone(),
                                                            Value::Array(vec![]),
                                                        );
                                                    }
                                                    _ => (),
                                                };
                                            }
                                            None => unreachable!(),
                                        };
                                    }
                                }
                            };
                            envs[input_idx][map_idx] = e;
                        }
                        _ => unreachable!(),
                    },
                    None => unreachable!(),
                });
            });

            // If we're currently in a map, stack the current block.
            if current_map.is_some() {
                current_map_blocks.push(name.clone());
            }

            // Special post-processing for map blocks.
            // TODO(spolu): extract some configs from Map such as `on_error` (fail, null) and
            // potentially `concurrency` override.
            if block.block_type() == BlockType::Map {
                current_map = Some(name.clone());
                current_map_blocks = vec![];

                envs = envs
                    .iter()
                    .map(|map_envs| {
                        assert!(map_envs.len() == 1);
                        let env = map_envs[0].clone();
                        match env.state.get(name) {
                            None => unreachable!(), // Checked at map block execution.
                            Some(v) => match v.as_array() {
                                None => unreachable!(), // Checked at map block execution.
                                Some(v) => v
                                    .iter()
                                    .enumerate()
                                    .map(|(i, v)| {
                                        let mut e = env.clone();
                                        e.map = Some(MapState {
                                            name: name.clone(),
                                            iteration: i,
                                        });
                                        e.state.insert(name.clone(), v.clone());
                                        e
                                    })
                                    .collect::<Vec<_>>(),
                            },
                        }
                    })
                    .collect::<Vec<_>>();
            }

            // Special post-processing of while blocks. We retrieve the output of the `while` block
            // to create the `current_skip` mask.
            if block.block_type() == BlockType::While {
                current_skips = Some(
                    envs.iter()
                        .map(|map_envs| {
                            assert!(map_envs.len() == 1);
                            match map_envs[0].state.get(name) {
                                Some(Value::Array(arr)) => {
                                    assert!(arr.len() > 0);
                                    // get latest value
                                    match arr.last() {
                                        Some(Value::Bool(b)) => !*b,
                                        _ => unreachable!(), // Checked at while block execution.
                                    }
                                }
                                _ => unreachable!(),
                            }
                        })
                        .collect::<Vec<bool>>(),
                );
            }

            // Special post-processing of end blocks. If `current_skips` are all true, we exit the
            // while loop otherwise we loop.
            if block.block_type() == BlockType::End {
                assert!(current_while.is_some());
                match current_skips.as_ref().unwrap().iter().all(|b| *b) {
                    true => {
                        current_while = None;
                        current_skips = None;
                        current_while_iteration = None;
                        block_idx += 1;
                        envs = envs
                            .iter()
                            .map(|map_envs| {
                                assert!(map_envs.len() == 1);
                                let mut env = map_envs[0].clone();
                                env.map = None;
                                vec![env]
                            })
                            .collect();
                    }
                    false => {
                        block_idx = current_while.unwrap();
                    }
                }
            } else {
                block_idx += 1;
            }
        }

        self.run.as_mut().unwrap().set_run_status(Status::Succeeded);
        store
            .as_ref()
            .update_run_status(&project, &run_id, self.run.as_ref().unwrap().status())
            .await?;
        info!(
            run = run_id.as_str(),
            app_version = self.hash(),
            "Run stored"
        );

        // Send an event for the run status update.
        match event_sender.as_ref() {
            Some(sender) => {
                let _ = sender.send(json!({
                    "type": "run_status",
                    "content": {
                        "status": Status::Succeeded,
                        "run_id": run_id,
                    }
                }));
            }
            None => (),
        };

        Ok(())
    }
}
