use crate::project::Project;
use crate::stores::{sqlite::SQLiteStore, store::Store};
use crate::utils;
use anyhow::Result;
use async_fs::File;
use futures::prelude::*;
use serde::Serialize;
use serde_json::Value;
use std::slice::Iter;

#[derive(Debug, Serialize)]
pub struct Dataset {
    created: u64,
    dataset_id: String,
    hash: String,
    keys: Vec<String>,
    // Guaranteed to be objects with keys.
    data: Vec<Value>,
}

impl Dataset {
    /// Creates a new Dataset object in memory from raw data (used by Store implementations when
    /// loading datasets).
    pub fn new_from_store(
        created: u64,
        dataset_id: &str,
        hash: &str,
        data: Vec<Value>,
    ) -> Result<Self> {
        let mut keys: Option<Vec<String>> = None;
        let mut hasher = blake3::Hasher::new();

        data.iter()
            .map(|d| {
                match d.as_object() {
                    Some(obj) => {
                        let record_keys: Vec<String> = obj.keys().cloned().collect();
                        if let Some(keys) = &keys {
                            assert!(*keys == record_keys);
                        } else {
                            keys = Some(record_keys);
                        }
                    }
                    None => unreachable!(),
                };

                // Reserialize json to hash it.
                hasher.update(serde_json::to_string(&d)?.as_bytes());
                Ok(())
            })
            .collect::<Result<_>>()?;

        let recomputed_hash = format!("{}", hasher.finalize().to_hex());
        assert!(recomputed_hash == hash);
        assert!(keys.is_some());

        Ok(Dataset {
            created,
            dataset_id: dataset_id.to_string(),
            hash: hash.to_string(),
            keys: keys.unwrap(),
            data,
        })
    }

    pub fn created(&self) -> u64 {
        self.created
    }

    pub fn dataset_id(&self) -> &str {
        &self.dataset_id
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn keys(&self) -> Vec<String> {
        self.keys.clone()
    }

    pub fn iter(&self) -> Iter<Value> {
        self.data.iter()
    }

    pub async fn from_hash(
        store: &dyn Store,
        project: &Project,
        dataset_id: &str,
        hash: &str,
    ) -> Result<Option<Self>> {
        store.load_dataset(project, dataset_id, hash).await
    }

    pub async fn new_from_jsonl(id: &str, data: Vec<Value>) -> Result<Self> {
        let mut keys: Option<Vec<String>> = None;
        let mut hasher = blake3::Hasher::new();

        let data = data
            .into_iter()
            .enumerate()
            .map(|(i, json)| {
                // Check that json is an Object and its keys match `all_keys`, error otherwise.
                match json.as_object() {
                    Some(obj) => {
                        let record_keys: Vec<String> = obj.keys().cloned().collect();
                        if let Some(keys) = &keys {
                            if *keys != record_keys {
                                Err(anyhow::anyhow!(
                                    "Dataset element {} has different keys from previous elements.",
                                    i,
                                ))?;
                            }
                        } else {
                            // This is the first object we've seen, so store its keys.
                            keys = Some(record_keys);
                        }
                    }
                    None => Err(anyhow::anyhow!(
                        "Dataset element {} is not a JSON object. Only JSON objects are expected \
                         as elements of a dataset",
                        i,
                    ))?,
                };

                // Reserialize json to hash it.
                hasher.update(serde_json::to_string(&json)?.as_bytes());

                Ok(json)
            })
            .collect::<Result<Vec<_>>>()?;

        let hash = format!("{}", hasher.finalize().to_hex());
        let keys = match keys {
            Some(keys) => keys,
            None => vec![],
        };

        Ok(Dataset {
            created: utils::now(),
            dataset_id: String::from(id),
            hash,
            keys: keys,
            data,
        })
    }

    pub fn data_as_value(&self) -> Value {
        self.data
            .iter()
            .map(|r| r.clone())
            .collect::<Vec<_>>()
            .into()
    }
}

pub async fn cmd_register(dataset_id: &str, jsonl_path: &str) -> Result<()> {
    let root_path = utils::init_check().await?;
    let store = SQLiteStore::new(root_path.join("store.sqlite"))?;
    store.init().await?;
    let project = Project::new_from_id(1);

    let jsonl_path = &shellexpand::tilde(jsonl_path).into_owned();
    let jsonl_path = std::path::Path::new(jsonl_path);

    let file = File::open(jsonl_path).await?;
    let reader = futures::io::BufReader::new(file);

    let data: Vec<Value> = reader
        .lines()
        .map(|line| {
            let line = line.unwrap();
            let json: Value = serde_json::from_str(&line)?;
            Ok(json)
        })
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<Vec<_>>>()?;

    let d = Dataset::new_from_jsonl(dataset_id, data).await?;

    let current_hash = store.latest_dataset_hash(&project, &d.dataset_id()).await?;
    if !(current_hash.is_some() && current_hash.unwrap() == d.hash()) {
        store.register_dataset(&project, &d).await?;
    }

    utils::done(&format!(
        "Registered dataset `{}` version ({}) with {} records (record keys: {:?})",
        d.dataset_id(),
        d.hash(),
        d.len(),
        d.keys(),
    ));

    Ok(())
}

pub async fn cmd_list() -> Result<()> {
    let root_path = utils::init_check().await?;
    let store = SQLiteStore::new(root_path.join("store.sqlite"))?;
    store.init().await?;
    let project = Project::new_from_id(1);

    let d = store.list_datasets(&project).await?;

    for (dataset_name, dataset_values) in d {
        for (hash, created) in dataset_values {
            utils::info(&format!(
                "Dataset: {} hash={} created={}",
                dataset_name,
                hash,
                utils::utc_date_from(created)
            ));
        }
    }
    Ok(())
}
