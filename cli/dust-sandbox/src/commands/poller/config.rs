use std::path::{Path, PathBuf};

use anyhow::{bail, Context};
use serde::Deserialize;

/// Where root installs the poller's initial credential. Readable by the poller's group and nobody
/// else, so a sandbox workload cannot pick it up.
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
            bail!(
                "poller token at {} is empty",
                self.installed_path.display()
            );
        }

        Ok(token)
    }

    pub fn store(&self, token: &str) -> anyhow::Result<()> {
        if let Some(parent) = self.state_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("failed to create poller state dir at {}", parent.display())
            })?;
        }

        // Written through a temporary file in the same directory so a crash mid-write cannot leave
        // a truncated credential behind, which would lock the poller out until the next wake.
        let temp_path = self.state_path.with_extension("tmp");
        std::fs::write(&temp_path, token).with_context(|| {
            format!("failed to write poller token to {}", temp_path.display())
        })?;
        restrict_to_owner(&temp_path)?;
        std::fs::rename(&temp_path, &self.state_path).with_context(|| {
            format!(
                "failed to move poller token into {}",
                self.state_path.display()
            )
        })?;

        Ok(())
    }
}

#[cfg(unix)]
fn restrict_to_owner(path: &Path) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .with_context(|| format!("failed to restrict {}", path.display()))
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) -> anyhow::Result<()> {
    Ok(())
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

    #[test]
    fn rejects_an_incomplete_config() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("poller.json");
        std::fs::write(&path, r#"{"apiUrl":"https://dust.example","workspaceId":""}"#)
            .expect("write config");

        assert!(PollerConfig::load(&path).is_err());
    }
}
