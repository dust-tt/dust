mod call;
mod convert;
mod create;
mod publish;
mod register;
mod share_link;
mod validate;

use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Context};
use clap::Subcommand;

pub use call::run as cmd_frame_call;
pub use convert::run as cmd_frame_convert;
pub use create::run as cmd_frame_create;
pub use publish::run as cmd_frame_publish;
pub use register::run as cmd_frame_register;
pub use share_link::run as cmd_frame_share_link;
pub use validate::run as cmd_frame_validate;

const FRAME_MANIFEST_FILE: &str = "manifest.json";
const FILES_ROOT: &str = "/files";

#[derive(Subcommand)]
pub enum FrameCommand {
    /// Invoke a named function from a Frame's active publication
    Call {
        /// Frame ID, or absolute path to its folder or manifest under /files
        target: String,
        /// Bare function name declared in the manifest
        function_name: String,
        /// JSON input passed to the function
        #[arg(long, value_name = "JSON")]
        input: Option<String>,
    },
    /// Convert a legacy Frame to Frames v2 while preserving identity and use rights
    Convert {
        /// Existing legacy Frame entry file under /files
        source: PathBuf,
        /// New v2 manifest path under the same mounted scope
        manifest: PathBuf,
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
    /// Register an existing Frame manifest and assign its stable identity
    Register {
        /// Absolute /files/.../manifest.json path
        manifest: PathBuf,
    },
    /// Retrieve the existing share link for a registered Frame
    ShareLink {
        /// Existing Frame folder under /files
        directory: PathBuf,
    },
    /// Validate a Frames v2 source without publishing it
    Validate {
        /// Absolute path to a v2 manifest under /files
        manifest: PathBuf,
    },
    /// Build and publish a Frame from its current source
    Publish {
        /// Absolute path to a v2 manifest or legacy Frame entry file under /files
        source: PathBuf,
    },
}

fn scoped_path(path: &Path) -> anyhow::Result<String> {
    scoped_path_under(path, Path::new(FILES_ROOT))
}

fn validate_scoped_path(path: &Path) -> anyhow::Result<()> {
    let relative = path
        .strip_prefix(FILES_ROOT)
        .with_context(|| format!("path must be under {FILES_ROOT}: {}", path.display()))?;
    validate_relative_scoped_path(relative).map(|_| ())
}

fn scoped_path_under(path: &Path, files_root: &Path) -> anyhow::Result<String> {
    let canonical_root = files_root
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", files_root.display()))?;
    let canonical_path = path
        .canonicalize()
        .with_context(|| format!("path must exist under {FILES_ROOT}: {}", path.display()))?;
    let relative = canonical_path
        .strip_prefix(&canonical_root)
        .with_context(|| format!("path must be under /files: {}", path.display()))?;

    validate_relative_scoped_path(relative)
}

fn validate_relative_scoped_path(relative: &Path) -> anyhow::Result<String> {
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
    use std::fs;
    use std::os::unix::fs::symlink;

    use super::*;

    #[test]
    fn converts_sandbox_frame_source_paths_to_scoped_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let files_root = temp.path().join("files");
        let manifest_path = files_root.join("pod-vlt_123/MyFrame/manifest.json");
        let legacy_entry_path = files_root.join("conversation-conv_123/Legacy.tsx");
        fs::create_dir_all(manifest_path.parent().expect("manifest parent"))
            .expect("create manifest parent");
        fs::create_dir_all(legacy_entry_path.parent().expect("legacy parent"))
            .expect("create legacy parent");
        fs::write(&manifest_path, "{}").expect("write manifest");
        fs::write(&legacy_entry_path, "export default null").expect("write entry");

        assert_eq!(
            scoped_path_under(&manifest_path, &files_root).expect("valid path"),
            "pod-vlt_123/MyFrame/manifest.json"
        );
        assert_eq!(
            scoped_path_under(&legacy_entry_path, &files_root).expect("valid path"),
            "conversation-conv_123/Legacy.tsx"
        );
    }

    #[test]
    fn resolves_legacy_mount_aliases_to_canonical_scoped_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let files_root = temp.path().join("files");
        let conversation_root = files_root.join("conversation-conv_123");
        let manifest_path = conversation_root.join("Status/manifest.json");
        fs::create_dir_all(manifest_path.parent().expect("manifest parent"))
            .expect("create manifest parent");
        fs::write(&manifest_path, "{}").expect("write manifest");
        symlink("conversation-conv_123", files_root.join("conversation"))
            .expect("create conversation alias");

        assert_eq!(
            scoped_path_under(
                &files_root.join("conversation/Status/manifest.json"),
                &files_root
            )
            .expect("valid alias path"),
            "conversation-conv_123/Status/manifest.json"
        );
    }

    #[test]
    fn rejects_paths_outside_the_mount() {
        let temp = tempfile::tempdir().expect("tempdir");
        let files_root = temp.path().join("files");
        let outside = temp.path().join("manifest.json");
        fs::create_dir(&files_root).expect("create files root");
        fs::write(&outside, "{}").expect("write outside file");

        assert!(scoped_path_under(&outside, &files_root).is_err());
        assert!(scoped_path_under(&files_root.join("missing.json"), &files_root).is_err());
        assert!(validate_scoped_path(Path::new("/tmp/manifest.json")).is_err());
        assert!(validate_scoped_path(Path::new("/files/../tmp/manifest.json")).is_err());
    }
}
