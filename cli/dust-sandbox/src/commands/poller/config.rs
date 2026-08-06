use std::path::{Path, PathBuf};

use anyhow::{bail, Context};
use serde::Deserialize;

/// Where root installs the poller's initial credential. Root-owned and root-readable only, since
/// the poller runs as root and no sandbox workload may pick it up.
pub const DEFAULT_INSTALLED_TOKEN_PATH: &str = "/etc/dust/poller-token";

/// Where root installs the poller's static settings.
pub const DEFAULT_CONFIG_PATH: &str = "/etc/dust/poller.json";

/// Where the poller keeps the credential it was last handed. Owned by the poller, since it is the
/// only writer, and `/etc/dust` stays root-only.
pub const DEFAULT_STATE_PATH: &str = "/var/lib/dust-poller/token";

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PollerConfig {
    pub api_url: String,
    pub workspace_id: String,
}

impl PollerConfig {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let raw = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read poller config at {}", path.display()))?;
        let config: Self = serde_json::from_str(&raw)
            .with_context(|| format!("invalid poller config at {}", path.display()))?;

        if config.api_url.is_empty() || config.workspace_id.is_empty() {
            bail!("poller config at {} is incomplete", path.display());
        }

        Ok(config)
    }

    pub fn work_channel_url(&self) -> String {
        format!(
            "{}/api/sse/v1/w/{}/sandbox/poller/work",
            self.api_url.trim_end_matches('/'),
            self.workspace_id
        )
    }

    pub fn claim_url(&self) -> String {
        format!(
            "{}/api/v1/w/{}/sandbox/poller/claim",
            self.api_url.trim_end_matches('/'),
            self.workspace_id
        )
    }

    pub fn result_url(&self) -> String {
        format!(
            "{}/api/v1/w/{}/sandbox/sandbox-functions/result",
            self.api_url.trim_end_matches('/'),
            self.workspace_id
        )
    }
}

/// The poller's credential, which front replaces on every connect.
///
/// Read from the poller's own state first: connecting is what revokes the token used to connect,
/// so the installed one only works until the first successful connect. Falling back to it covers
/// the first start after a wake, when no rotated token exists yet.
pub struct TokenStore {
    state_path: PathBuf,
    installed_path: PathBuf,
}

impl TokenStore {
    pub fn new(state_path: PathBuf, installed_path: PathBuf) -> Self {
        Self {
            state_path,
            installed_path,
        }
    }

    pub fn load(&self) -> anyhow::Result<String> {
        if let Ok(token) = std::fs::read_to_string(&self.state_path) {
            let token = token.trim().to_string();
            if !token.is_empty() {
                return Ok(token);
            }
        }

        let token = std::fs::read_to_string(&self.installed_path).with_context(|| {
            format!(
                "failed to read poller token at {}",
                self.installed_path.display()
            )
        })?;
        let token = token.trim().to_string();
        if token.is_empty() {
            bail!("poller token at {} is empty", self.installed_path.display());
        }

        Ok(token)
    }

    /// Forget the stored credential, so the next load falls back to the installed one.
    ///
    /// Used when front refuses what we have: a state file holding a revoked token would otherwise
    /// be retried forever, since nothing else rewrites it until the sandbox next wakes.
    pub fn forget(&self) -> anyhow::Result<()> {
        match std::fs::remove_file(&self.state_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error).with_context(|| {
                format!(
                    "failed to clear the poller token at {}",
                    self.state_path.display()
                )
            }),
        }
    }

    pub fn store(&self, token: &str) -> anyhow::Result<()> {
        if let Some(parent) = self.state_path.parent() {
            create_private_dir(parent)?;
        }

        // Written through a temporary file in the same directory so a crash mid-write cannot leave
        // a truncated credential behind, which would lock the poller out until the next wake. The
        // file is created already restricted rather than chmod'd afterwards: the window between
        // the two is a live credential readable by anyone, once a minute, forever.
        let temp_path = self.state_path.with_extension("tmp");
        let write = write_private_file(&temp_path, token).and_then(|()| {
            std::fs::rename(&temp_path, &self.state_path).with_context(|| {
                format!(
                    "failed to move poller token into {}",
                    self.state_path.display()
                )
            })
        });

        if write.is_err() {
            // Leaving it behind would strand a usable credential in a file nothing rewrites.
            let _ = std::fs::remove_file(&temp_path);
        }

        write
    }
}

#[cfg(unix)]
fn write_private_file(path: &Path, contents: &str) -> anyhow::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    file.write_all(contents.as_bytes())
        .with_context(|| format!("failed to write {}", path.display()))
}

#[cfg(not(unix))]
fn write_private_file(path: &Path, contents: &str) -> anyhow::Result<()> {
    std::fs::write(path, contents).with_context(|| format!("failed to write {}", path.display()))
}

#[cfg(unix)]
fn create_private_dir(path: &Path) -> anyhow::Result<()> {
    use std::os::unix::fs::DirBuilderExt;

    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(path)
        .with_context(|| format!("failed to create poller state dir at {}", path.display()))
}

#[cfg(not(unix))]
fn create_private_dir(path: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(path)
        .with_context(|| format!("failed to create poller state dir at {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_urls_without_double_slashes() {
        let config = PollerConfig {
            api_url: "https://dust.example/".to_string(),
            workspace_id: "w1".to_string(),
        };

        assert_eq!(
            config.work_channel_url(),
            "https://dust.example/api/sse/v1/w/w1/sandbox/poller/work"
        );
        assert_eq!(
            config.claim_url(),
            "https://dust.example/api/v1/w/w1/sandbox/poller/claim"
        );
        assert_eq!(
            config.result_url(),
            "https://dust.example/api/v1/w/w1/sandbox/sandbox-functions/result"
        );
    }

    #[test]
    fn prefers_the_rotated_token_over_the_installed_one() {
        let dir = tempfile::tempdir().expect("tempdir");
        let installed = dir.path().join("installed");
        let state = dir.path().join("state");
        std::fs::write(&installed, "sbt-installed").expect("write installed");

        let store = TokenStore::new(state.clone(), installed.clone());
        assert_eq!(store.load().expect("load"), "sbt-installed");

        store.store("sbt-rotated").expect("store");
        assert_eq!(store.load().expect("load"), "sbt-rotated");
    }

    #[test]
    fn falls_back_to_the_installed_token_when_the_state_is_empty() {
        let dir = tempfile::tempdir().expect("tempdir");
        let installed = dir.path().join("installed");
        let state = dir.path().join("state");
        std::fs::write(&installed, "sbt-installed\n").expect("write installed");
        std::fs::write(&state, "   ").expect("write state");

        let store = TokenStore::new(state, installed);

        assert_eq!(store.load().expect("load"), "sbt-installed");
    }

    #[cfg(unix)]
    #[test]
    fn stores_the_rotated_token_readable_only_by_the_poller() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().expect("tempdir");
        let state = dir.path().join("nested").join("token");
        let store = TokenStore::new(state.clone(), dir.path().join("installed"));

        store.store("sbt-rotated").expect("store");

        // Creating the file already restricted matters more than restricting it after: the window
        // between the two would be a live credential any account could read, once a minute.
        let mode = std::fs::metadata(&state)
            .expect("metadata")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
        let dir_mode = std::fs::metadata(state.parent().expect("parent"))
            .expect("dir metadata")
            .permissions()
            .mode();
        assert_eq!(dir_mode & 0o777, 0o700);
    }

    #[test]
    fn forgetting_a_refused_token_falls_back_to_the_installed_one() {
        let dir = tempfile::tempdir().expect("tempdir");
        let installed = dir.path().join("installed");
        let state = dir.path().join("state");
        std::fs::write(&installed, "sbt-installed").expect("write installed");
        let store = TokenStore::new(state, installed);
        store.store("sbt-revoked").expect("store");

        store.forget().expect("forget");

        assert_eq!(store.load().expect("load"), "sbt-installed");
        // Forgetting what is already gone is not an error: it runs on every refused connect.
        store.forget().expect("forget again");
    }

    #[test]
    fn rejects_an_incomplete_config() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("poller.json");
        std::fs::write(
            &path,
            r#"{"apiUrl":"https://dust.example","workspaceId":""}"#,
        )
        .expect("write config");

        assert!(PollerConfig::load(&path).is_err());
    }
}
