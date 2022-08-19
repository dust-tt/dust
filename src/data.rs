use crate::utils;
use anyhow::Result;
use serde_json::Value;
use std::collections::HashSet;
use std::fs::File;
use std::io::prelude::*;
use std::io::{BufRead, BufReader};

pub fn register(id: String, path: String) -> Result<()> {
    let root_path = utils::init_check()?;

    let path = &shellexpand::tilde(&path).into_owned();
    let path = std::path::Path::new(path);

    let file = File::open(path)?;
    let reader = BufReader::new(file);

    let mut all_keys: Option<HashSet<String>> = None;
    let mut hasher = blake3::Hasher::new();

    let data = reader.lines().enumerate().map(|(line_number, line)| {
    let line = line.unwrap();
    let json: Value = serde_json::from_str(&line)?;

    // Check that json is an Object and its keys match `all_keys`, error otherwise.
    let json = match json.as_object() {
      Some(json) => {
        let keys: HashSet<String> = json.keys().cloned().collect();
        if let Some(all_keys) = &all_keys {
          if *all_keys != keys {
            Err(anyhow::anyhow!(
              "Line {}: JSON Object has different keys from previous lines.",
              line_number
            ))?;
          }
        } else {
          // This is the first object we've seen, so store its keys.
          all_keys = Some(keys);
        }
        json
      }
      None => Err(anyhow::anyhow!(
        "Line {}: Not a JSON object. Only JSON Objects are expected at each line of the JSONL file.",
        line_number
      ))?,
    };

    // Reserialize json and hash it.
    let json = serde_json::to_string(&json)?;
    hasher.update(json.as_bytes());

    Ok(json)
  }).collect::<Result<Vec<_>>>()?;

    let hash = format!("{}", hasher.finalize().to_hex());

    let data_path = root_path.join(".data").join(&id);
    if !data_path.exists() {
        utils::action(&format!("Creating directory {}", data_path.display()));
        std::fs::create_dir_all(&data_path)?;
    }
    if !data_path.is_dir() {
        return Err(anyhow::anyhow!(
            "{} is not a directory",
            data_path.display()
        ));
    }

    let jsonl_path = data_path.join(&hash).with_extension("jsonl");
    let latest_path = data_path.join("latest");

    utils::action(&format!("Writing data in {}", jsonl_path.display()));
    let mut file = File::create(jsonl_path)?;
    let length = data.len();
    for line in data {
        file.write_all(line.as_bytes())?;
        file.write_all(b"\n")?;
    }

    utils::action(&format!("Updating {}", latest_path.display()));
    std::fs::write(latest_path, hash.as_bytes())?;

    utils::done(&format!(
        "Created new `{}` JSONL version ({}) with {} records (record keys: {:?})",
        id,
        hash,
        length,
        all_keys.unwrap().iter().collect::<Vec<_>>(),
    ));

    Ok(())
}
