mod publish;

use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Context};
use clap::Subcommand;

use crate::api::FramePublishResponse;

pub use publish::run as cmd_frame_publish;

#[derive(Subcommand)]
pub enum FrameCommand {
    /// Build and publish a Frame from its current source
    Publish {
        /// Absolute path to a v2 manifest or legacy Frame entry file under /files
        source: PathBuf,
    },
}

fn scoped_path(path: &Path) -> anyhow::Result<String> {
    let relative = path
        .strip_prefix("/files")
        .with_context(|| format!("path must be under /files: {}", path.display()))?;
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("path must identify a file or folder directly under a mounted /files scope");
    }

    relative
        .to_str()
        .map(str::to_owned)
        .context("path must be valid UTF-8")
}

fn print_response(response: &FramePublishResponse) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string(response)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_sandbox_frame_source_paths_to_scoped_paths() {
        let manifest_path = Path::new("/files/pod-vlt_123/MyFrame/manifest.json");
        assert_eq!(
            scoped_path(manifest_path).expect("valid path"),
            "pod-vlt_123/MyFrame/manifest.json"
        );

        let legacy_entry_path = Path::new("/files/conversation-conv_123/Legacy.tsx");
        assert_eq!(
            scoped_path(legacy_entry_path).expect("valid path"),
            "conversation-conv_123/Legacy.tsx"
        );
    }

    #[test]
    fn rejects_paths_outside_the_mount() {
        assert!(scoped_path(Path::new("/tmp/manifest.json")).is_err());
        assert!(scoped_path(Path::new("/files/../tmp/manifest.json")).is_err());
    }
}
