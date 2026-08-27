mod create;
mod publish;
mod register;

use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Context};
use clap::Subcommand;

use crate::api::FrameLifecycleResponse;

pub use create::run as cmd_frame_create;
pub use publish::run as cmd_frame_publish;
pub use register::run as cmd_frame_register;

const FRAME_MANIFEST_FILE: &str = "manifest.json";

#[derive(Subcommand)]
pub enum FrameCommand {
    /// Create and register a new Frame folder
    Create {
        /// Frame folder under /files/conversation-... or /files/pod-...
        directory: PathBuf,
        /// Display name (defaults to the folder name)
        #[arg(long)]
        name: Option<String>,
        /// Frame description
        #[arg(long, default_value = "")]
        description: String,
    },
    /// Register an existing Frame manifest and assign its stable identity
    Register {
        /// Absolute /files/.../manifest.json path
        manifest: PathBuf,
    },
    /// Validate, build, and atomically publish a Frame
    Publish {
        /// Absolute /files/.../manifest.json path
        manifest: PathBuf,
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

fn scoped_manifest_path(path: &Path) -> anyhow::Result<String> {
    if path.file_name().and_then(|name| name.to_str()) != Some(FRAME_MANIFEST_FILE) {
        bail!("Frame path must end in {FRAME_MANIFEST_FILE}");
    }
    scoped_path(path)
}

fn print_response(response: &FrameLifecycleResponse) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string(response)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_sandbox_manifest_path_to_scoped_path() {
        let path = Path::new("/files/pod-vlt_123/MyFrame/manifest.json");
        assert_eq!(
            scoped_manifest_path(path).expect("valid path"),
            "pod-vlt_123/MyFrame/manifest.json"
        );
    }

    #[test]
    fn rejects_paths_outside_the_mount() {
        assert!(scoped_manifest_path(Path::new("/tmp/manifest.json")).is_err());
        assert!(scoped_manifest_path(Path::new("/files/../tmp/manifest.json")).is_err());
        assert!(scoped_manifest_path(Path::new("/files/pod-vlt_123/index.tsx")).is_err());
    }
}
