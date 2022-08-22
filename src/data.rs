use crate::utils;
use anyhow::Result;
use async_fs::File;
use futures::prelude::*;
use serde_json::Value;
use std::collections::HashSet;
use async_std::path::PathBuf;

pub struct Data {
    id: String,
    hash: String,
    keys: HashSet<String>,
    data: Vec<serde_json::Map<String, Value>>,
}

impl Data {
    async fn data_path(id: &String) -> Result<PathBuf> {
        let root_path = utils::init_check().await?;
        Ok(root_path.join(".data").join(id))
    }

    async fn latest_path(id: &String) -> Result<PathBuf> {
        Ok(Self::data_path(id).await?.join("latest"))
    }

    async fn jsonl_path(id: &String, hash: &String) -> Result<PathBuf> {
        Ok(Self::data_path(id).await?.join(hash).with_extension("jsonl"))
    }

    pub async fn new_from_hash(id: String, hash: String) -> Result<Self> {
        let jsonl_path = Self::jsonl_path(&id, &hash).await?;

        if !jsonl_path.exists().await {
            Err(anyhow::anyhow!(
                "Expected JSONL file does not exist: {}",
                jsonl_path.display()
            ))?;
        }

        let d =
            Self::new_from_jsonl(id, jsonl_path.into_os_string().into_string().unwrap()).await?;
        assert!(d.hash == hash);

        Ok(d)
    }

    pub async fn new_from_latest(id: String) -> Result<Self> {
        let latest_path = Self::latest_path(&id).await?;

        if !latest_path.exists().await {
            Err(anyhow::anyhow!(
                "Expected latest file does not exist: {}",
                latest_path.display()
            ))?;
        }

        // Read the content of latest file as a string
        let mut file = File::open(latest_path).await?;
        let mut hash = String::new();
        file.read_to_string(&mut hash).await?;

        Self::new_from_hash(id, hash).await
    }

    pub async fn new_from_jsonl(id: String, jsonl_path: String) -> Result<Self> {
        let jsonl_path = &shellexpand::tilde(&jsonl_path).into_owned();
        let jsonl_path = std::path::Path::new(jsonl_path);

        let file = File::open(jsonl_path).await?;
        //let reader = BufReader::new(file);
        let reader = futures::io::BufReader::new(file);

        let mut keys: Option<HashSet<String>> = None;
        let mut hasher = blake3::Hasher::new();

        let data: Vec<serde_json::Map<String, Value>> = reader
            .lines()
            .enumerate()
            .map(|(line_number, line)| {
                let line = line.unwrap();
                let json: Value = serde_json::from_str(&line)?;

                // Check that json is an Object and its keys match `all_keys`, error otherwise.
                let json = match json.as_object() {
                    Some(json) => {
                        let record_keys: HashSet<String> = json.keys().cloned().collect();
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
                        json
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
            id,
            hash,
            keys: keys.unwrap(),
            data,
        })
    }

    pub async fn register(&self) -> Result<()> {
        let data_path = Self::data_path(&self.id).await?;

        if !data_path.exists().await {
            utils::action(&format!("Creating directory {}", data_path.display()));
            std::fs::create_dir_all(&data_path)?;
        }
        if !data_path.is_dir().await {
            Err(anyhow::anyhow!(
                "{} is not a directory",
                data_path.display()
            ))?;
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
}

pub async fn cmd_register(id: String, jsonl_path: String) -> Result<()> {
    let d = Data::new_from_jsonl(id, jsonl_path).await?;
    d.register().await
}