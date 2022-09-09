use crate::utils;
use anyhow::Result;
use async_fs::File;
use async_std::path::PathBuf;
use futures::prelude::*;
use serde_json::Value;
use std::{collections::HashSet, slice::Iter};

pub struct Data {
    id: String,
    hash: String,
    keys: HashSet<String>,
    // Guaranteed to be objects with keys.
    data: Vec<Value>,
}

impl Data {
    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn iter(&self) -> Iter<Value> {
        self.data.iter()
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    async fn data_dir(id: &str) -> Result<PathBuf> {
        let root_path = utils::init_check().await?;
        Ok(root_path.join(".data").join(id))
    }

    async fn latest_path(id: &str) -> Result<PathBuf> {
        Ok(Self::data_dir(id).await?.join("latest"))
    }

    async fn jsonl_path(id: &str, hash: &str) -> Result<PathBuf> {
        Ok(Self::data_dir(id).await?.join(hash).with_extension("jsonl"))
    }

    pub async fn from_hash(id: &str, hash: &str) -> Result<Self> {
        let jsonl_path = Self::jsonl_path(id, hash).await?;

        if !jsonl_path.exists().await {
            Err(anyhow::anyhow!(
                "Expected JSONL file does not exist: {}",
                jsonl_path.display()
            ))?;
        }

        let d = Self::new_from_jsonl(
            id,
            jsonl_path.into_os_string().into_string().unwrap().as_str(),
        )
        .await?;
        assert!(d.hash == hash);

        Ok(d)
    }

    pub async fn from_latest(id: &str) -> Result<Self> {
        let latest_path = Self::latest_path(id).await?;

        if !latest_path.exists().await {
            Err(anyhow::anyhow!(
                "Data id does not exist: {} (expecting: {})",
                id,
                latest_path.display()
            ))?;
        }

        // Read the content of latest file as a string.
        let mut file = File::open(latest_path).await?;
        let mut hash = String::new();
        file.read_to_string(&mut hash).await?;

        Self::from_hash(id, hash.as_str()).await
    }

    pub async fn new_from_jsonl(id: &str, jsonl_path: &str) -> Result<Self> {
        let jsonl_path = &shellexpand::tilde(jsonl_path).into_owned();
        let jsonl_path = std::path::Path::new(jsonl_path);

        let file = File::open(jsonl_path).await?;
        let reader = futures::io::BufReader::new(file);

        let mut keys: Option<HashSet<String>> = None;
        let mut hasher = blake3::Hasher::new();

        let data: Vec<Value> = reader
            .lines()
            .enumerate()
            .map(|(line_number, line)| {
                let line = line.unwrap();
                let json: Value = serde_json::from_str(&line)?;

                // Check that json is an Object and its keys match `all_keys`, error otherwise.
                match json.as_object() {
                    Some(obj) => {
                        let record_keys: HashSet<String> = obj.keys().cloned().collect();
                        if let Some(keys) = &keys {
                            if *keys != record_keys {
                                Err(anyhow::anyhow!(
                                    "Line {}: JSON Object has different keys from previous lines.",
                                    line_number
                                ))?;
                            }
                        } else {
                            // This is the first object we've seen, so store its keys.
                            keys = Some(record_keys);
                        }
                    }
                    None => Err(anyhow::anyhow!(
                        "Line {}: Not a JSON object. Only JSON Objects are expected \
                         at each line of the JSONL file.",
                        line_number
                    ))?,
                };

                // Reserialize json to hash it.
                hasher.update(serde_json::to_string(&json)?.as_bytes());

                Ok(json.to_owned())
            })
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>>>()?;

        let hash = format!("{}", hasher.finalize().to_hex());

        Ok(Data {
            id: String::from(id),
            hash,
            keys: keys.unwrap(),
            data,
        })
    }

    pub async fn register(&self) -> Result<()> {
        let data_dir = Self::data_dir(&self.id).await?;

        if !data_dir.exists().await {
            utils::action(&format!("Creating directory {}", data_dir.display()));
            async_std::fs::create_dir_all(&data_dir).await?;
        }
        if !data_dir.is_dir().await {
            Err(anyhow::anyhow!("{} is not a directory", data_dir.display()))?;
        }

        let jsonl_path = Self::jsonl_path(&self.id, &self.hash).await?;

        utils::action(&format!("Writing data in {}", jsonl_path.display()));
        let mut file = File::create(jsonl_path).await?;
        for json in &self.data {
            file.write_all(serde_json::to_string(&json)?.as_bytes())
                .await?;
            file.write_all(b"\n").await?;
        }
        file.flush().await?;

        let latest_path = Self::latest_path(&self.id).await?;

        utils::action(&format!("Updating {}", latest_path.display()));
        async_std::fs::write(latest_path, self.hash.as_bytes()).await?;

        utils::done(&format!(
            "Created new `{}` JSONL version ({}) with {} records (record keys: {:?})",
            self.id,
            self.hash,
            self.data.len(),
            self.keys.iter().collect::<Vec<_>>(),
        ));

        Ok(())
    }

    pub fn data_as_value(&self) -> Value {
        self.data
            .iter()
            .map(|r| r.clone())
            .collect::<Vec<_>>()
            .into()
    }
}

pub async fn cmd_register(data_id: &str, jsonl_path: &str) -> Result<()> {
    let d = Data::new_from_jsonl(data_id, jsonl_path).await?;
    d.register().await
}
