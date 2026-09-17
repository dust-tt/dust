use std::path::{Component, Path, PathBuf};

use anyhow::{ensure, Context};
use serde::Deserialize;

pub(super) struct FrameSource {
    pub root: PathBuf,
    pub entry: PathBuf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrameManifest {
    ui_entry_point: Option<String>,
}

impl FrameSource {
    pub fn resolve(source: &Path) -> anyhow::Result<Self> {
        let source = source
            .canonicalize()
            .with_context(|| format!("Frame source does not exist: {}", source.display()))?;
        let manifest = if source.is_dir() {
            source.join("manifest.json")
        } else {
            source.clone()
        };
        if manifest
            .file_name()
            .is_some_and(|name| name == "manifest.json")
            && manifest.is_file()
        {
            let parsed: FrameManifest = serde_json::from_slice(&std::fs::read(&manifest)?)
                .context("invalid Frame manifest")?;
            let relative = PathBuf::from(
                parsed
                    .ui_entry_point
                    .unwrap_or_else(|| "index.tsx".to_owned()),
            );
            ensure!(
                relative
                    .components()
                    .all(|component| matches!(component, Component::Normal(_))),
                "Frame UI entry must stay inside its folder"
            );
            let root = manifest
                .parent()
                .context("Frame manifest has no parent directory")?
                .to_owned();
            let entry = root.join(relative);
            ensure!(
                entry.is_file() && is_source_file(&entry),
                "Frame UI entry must be an existing TSX, TS, JSX or JS file: {}",
                entry.display()
            );
            return Ok(Self { root, entry });
        }
        let entry = if source.is_dir() {
            source.join("index.tsx")
        } else {
            source
        };
        ensure!(
            entry.is_file() && is_source_file(&entry),
            "expected a Frame folder, manifest.json or UI entry file"
        );
        let root = entry
            .parent()
            .context("Frame entry has no parent directory")?
            .to_owned();
        Ok(Self { root, entry })
    }
}

pub(super) fn is_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("ts" | "tsx" | "js" | "jsx")
    ) && !path.to_string_lossy().ends_with(".d.ts")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn resolves_a_manifest_custom_entry_and_a_legacy_file() {
        let directory = tempfile::tempdir().expect("Frame directory");
        let root = directory.path().canonicalize().expect("canonical root");
        fs::create_dir(root.join("ui")).expect("create UI directory");
        fs::write(root.join("ui/main.tsx"), "export default null").expect("write UI");
        fs::write(
            root.join("manifest.json"),
            r#"{"uiEntryPoint":"ui/main.tsx"}"#,
        )
        .expect("write manifest");
        for path in [&root, &root.join("manifest.json")] {
            let source = FrameSource::resolve(path).expect("resolve Frame");
            assert_eq!(source.root, root);
            assert_eq!(source.entry, root.join("ui/main.tsx"));
        }
        let legacy = FrameSource::resolve(&root.join("ui/main.tsx")).expect("resolve legacy Frame");
        assert_eq!(legacy.root, root.join("ui"));
        fs::write(
            root.join("manifest.json"),
            r#"{"uiEntryPoint":"../outside.tsx"}"#,
        )
        .expect("write invalid manifest");
        assert!(FrameSource::resolve(&root).is_err());
    }
}
