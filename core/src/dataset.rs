use crate::project::Project;
use crate::stores::store::Store;
use crate::utils;
use anyhow::Result;
use serde::Serialize;
use serde_json::Value;
use std::slice::Iter;
use tracing::info;

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
                            assert_eq!(*keys, record_keys);
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
            .collect::<Result<()>>()?;

        let recomputed_hash = format!("{}", hasher.finalize().to_hex());

        info!(
            hash = hash,
            recomputed_hash = recomputed_hash,
            keys = ?keys,
            "asserting recomputed_hash == hash"
        );

        assert_eq!(recomputed_hash, hash);
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

    pub fn iter(&self) -> Iter<'_, Value> {
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
        let keys = keys.unwrap_or_else(|| vec![]);

        Ok(Dataset {
            created: utils::now(),
            dataset_id: String::from(id),
            hash,
            keys,
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
