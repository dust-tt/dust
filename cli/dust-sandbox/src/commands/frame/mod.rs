mod clone;
mod create;
mod delete;
mod move_frame;
mod publish;
mod register;
mod share;

use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Context};
use clap::{Subcommand, ValueEnum};

pub use clone::run as cmd_frame_clone;
pub use create::run as cmd_frame_create;
pub use delete::run as cmd_frame_delete;
pub use move_frame::run as cmd_frame_move;
pub use publish::run as cmd_frame_publish;
pub use register::run as cmd_frame_register;
pub use share::run as cmd_frame_share;

const FRAME_MANIFEST_FILE: &str = "manifest.json";

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum FrameShareScope {
    EmailsOnly,
    Public,
    WorkspaceAndEmails,
}

impl FrameShareScope {
    fn as_api_value(self) -> &'static str {
        match self {
            Self::EmailsOnly => "emails_only",
            Self::Public => "public",
            Self::WorkspaceAndEmails => "workspace_and_emails",
        }
    }
}

#[derive(Subcommand)]
pub enum FrameCommand {
    /// Clone a registered Frame into a fresh identity, publication, sharing record, and state
    Clone {
        /// Existing Frame folder under /files
        source: PathBuf,
        /// New Frame folder path under /files
        destination: PathBuf,
    },
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
    /// Permanently delete a registered Frame, its source folder, and owned runtime data
    Delete {
        /// Existing Frame folder under /files
        directory: PathBuf,
    },
    /// Register an existing Frame manifest and assign its stable identity
    Register {
        /// Absolute /files/.../manifest.json path
        manifest: PathBuf,
    },
    /// Move a registered Frame folder while preserving its identity and state
    Move {
        /// Existing Frame folder under /files
        source: PathBuf,
        /// New Frame folder path under /files
        destination: PathBuf,
    },
    /// Configure who can use a registered Frame
    Share {
        /// Existing Frame folder under /files
        directory: PathBuf,
        /// Use-rights scope
        #[arg(long, value_enum)]
        scope: FrameShareScope,
        /// Email to grant access to; repeat for multiple recipients
        #[arg(long = "email")]
        emails: Vec<String>,
    },
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

fn scoped_manifest_path(path: &Path) -> anyhow::Result<String> {
    if path.file_name().and_then(|name| name.to_str()) != Some(FRAME_MANIFEST_FILE) {
        bail!("Frame path must end in {FRAME_MANIFEST_FILE}");
    }
    scoped_path(path)
}

fn print_response(response: &impl serde::Serialize) -> anyhow::Result<()> {
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
