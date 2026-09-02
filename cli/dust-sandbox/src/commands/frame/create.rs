use std::fs;
use std::path::Path;

use anyhow::{bail, Context};

use crate::api::DustApiClient;

use super::{print_response, scoped_manifest_path, validate_scoped_path, FRAME_MANIFEST_FILE};

const FRAME_UI_ENTRY_POINT: &str = "index.tsx";
const DEFAULT_FRAME_SOURCE: &str = r#"export default function Frame() {
  return <main>New Frame</main>;
}
"#;

pub async fn run(directory: &Path, name: Option<&str>, description: &str) -> anyhow::Result<()> {
    let manifest_path = directory.join(FRAME_MANIFEST_FILE);
    validate_scoped_path(&manifest_path)?;
    let frame_name = match name {
        Some(name) => name.to_owned(),
        None => directory
            .file_name()
            .and_then(|value| value.to_str())
            .context("Frame folder must have a valid UTF-8 name")?
            .to_owned(),
    };
    if frame_name.is_empty() {
        bail!("Frame name cannot be empty");
    }

    scaffold(directory, &frame_name, description)?;
    // Scaffold first so canonicalization can follow `/files/conversation` and `/files/pod`
    // symlinks even when the new Frame directory did not exist before this command.
    let scoped_manifest_path = scoped_manifest_path(&manifest_path)?;

    let client = DustApiClient::from_env()?;
    let response = client.register_frame(&scoped_manifest_path).await?;
    print_response(&response)
}

fn scaffold(directory: &Path, name: &str, description: &str) -> anyhow::Result<()> {
    let manifest_path = directory.join(FRAME_MANIFEST_FILE);
    let ui_path = directory.join(FRAME_UI_ENTRY_POINT);
    if manifest_path.exists() || ui_path.exists() {
        bail!("Frame source already exists in {}", directory.display());
    }

    fs::create_dir_all(directory)
        .with_context(|| format!("failed to create {}", directory.display()))?;
    let manifest = serde_json::to_string_pretty(&serde_json::json!({
        "version": 1,
        "name": name,
        "description": description,
    }))?;
    fs::write(&manifest_path, format!("{manifest}\n"))
        .with_context(|| format!("failed to write {}", manifest_path.display()))?;
    fs::write(&ui_path, DEFAULT_FRAME_SOURCE)
        .with_context(|| format!("failed to write {}", ui_path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaffolds_a_minimal_frame_without_overwriting() {
        let temp = tempfile::tempdir().expect("tempdir");
        let directory = temp.path().join("Status");

        scaffold(&directory, "Status", "Current status").expect("scaffold");

        let manifest =
            fs::read_to_string(directory.join(FRAME_MANIFEST_FILE)).expect("read manifest");
        let parsed: serde_json::Value = serde_json::from_str(&manifest).expect("parse manifest");
        assert_eq!(parsed["name"], "Status");
        assert!(directory.join(FRAME_UI_ENTRY_POINT).exists());
        assert!(scaffold(&directory, "Other", "").is_err());
    }
}
