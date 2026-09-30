use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Result, bail, ensure};
use axum::http::{HeaderMap, header};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tokio::{sync::Mutex, time::Instant};
use uuid::Uuid;

use super::ApiError;
use crate::{model::WorkspaceId, storage::Storage};

const SESSION_TTL_SECONDS: u64 = 3600;
const MAX_SESSIONS: usize = 10_000;

pub struct Access {
    server_key_hash: Option<[u8; 32]>,
    sessions: Mutex<SessionStore>,
}

pub(crate) struct Session {
    pub id: String,
    pub workspace: WorkspaceId,
    pub grants: BTreeSet<String>,
    pub expires_at: u64,
    deadline: Instant,
}

#[derive(Default)]
struct SessionStore {
    by_key: HashMap<[u8; 32], Arc<Session>>,
    by_expiry: BTreeMap<(Instant, [u8; 32]), ()>,
}

impl Access {
    pub fn from_env() -> Result<Self> {
        match std::env::var("DFS_SERVER_KEY") {
            Ok(key) => Self::new(Some(&key)),
            Err(std::env::VarError::NotPresent) => Self::new(None),
            Err(std::env::VarError::NotUnicode(_)) => bail!("DFS_SERVER_KEY must be ASCII"),
        }
    }

    pub fn new(server_key: Option<&str>) -> Result<Self> {
        if let Some(key) = server_key {
            ensure!(
                (32..=512).contains(&key.len()) && key.bytes().all(key_character),
                "DFS_SERVER_KEY must contain 32–512 ASCII letters, digits, '-' or '_'"
            );
        }
        Ok(Self {
            server_key_hash: server_key.map(fingerprint),
            sessions: Mutex::new(SessionStore::default()),
        })
    }

    pub(super) fn authorize_creation(&self, key: &str) -> Result<(), ApiError> {
        let expected = self.server_key_hash.ok_or(ApiError::Unavailable)?;
        if matches_hash(&expected, key) {
            Ok(())
        } else {
            Err(ApiError::Unauthenticated)
        }
    }

    /**
     * @cc [owner:spolu,label:security] delegated-session-grants
     * Callers MUST verify the workspace key against durable state before issuing a session.
     * The verified key authorizes any opaque grant set in that workspace, up to 512 distinct values.
     * Session keys MUST NOT authorize workspace creation, grant administration, or further sessions.
     */
    pub(super) async fn create_session(
        &self,
        workspace: WorkspaceId,
        grants: BTreeSet<String>,
    ) -> Result<(Arc<Session>, String), ApiError> {
        if grants.len() > 512 {
            return Err(ApiError::InvalidInput);
        }
        let mut sessions = self.sessions.lock().await;
        let now = Instant::now();
        sessions.remove_expired(now);
        if sessions.by_key.len() >= MAX_SESSIONS {
            return Err(ApiError::CapacityExhausted);
        }
        let key = issue_key("dfss_")?;
        let hash = fingerprint(&key);
        if sessions.by_key.contains_key(&hash) {
            return Err(ApiError::Internal);
        }
        let expires_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ApiError::Internal)?
            .as_secs()
            .checked_add(SESSION_TTL_SECONDS)
            .ok_or(ApiError::Internal)?;
        let session = Arc::new(Session {
            id: Uuid::new_v4().simple().to_string(),
            workspace,
            grants,
            expires_at,
            deadline: now + Duration::from_secs(SESSION_TTL_SECONDS),
        });
        sessions.by_expiry.insert((session.deadline, hash), ());
        sessions.by_key.insert(hash, session.clone());
        Ok((session, key))
    }

    pub(super) async fn session(&self, key: &str) -> Result<Arc<Session>, ApiError> {
        require_key_kind(key, "dfss_")?;
        let mut sessions = self.sessions.lock().await;
        sessions.remove_expired(Instant::now());
        sessions
            .by_key
            .get(&fingerprint(key))
            .cloned()
            .ok_or(ApiError::Unauthenticated)
    }

    pub(super) async fn close_session(&self, key: &str, id: &str) -> Result<(), ApiError> {
        require_key_kind(key, "dfss_")?;
        let hash = fingerprint(key);
        let mut sessions = self.sessions.lock().await;
        sessions.remove_expired(Instant::now());
        let session = sessions
            .by_key
            .get(&hash)
            .ok_or(ApiError::Unauthenticated)?;
        if session.id != id {
            return Err(ApiError::NotFound);
        }
        let expiry = (session.deadline, hash);
        sessions.by_expiry.remove(&expiry);
        sessions.by_key.remove(&hash);
        Ok(())
    }
}

impl SessionStore {
    /**
     * @cc [owner:spolu,label:security] ephemeral-session-lifetime
     * Expired or closed sessions MUST never authenticate. Sessions MUST remain process-local and
     * immutable after creation. Cleanup MUST remove expired entries from both registry indexes.
     */
    fn remove_expired(&mut self, now: Instant) {
        while let Some(entry) = self.by_expiry.first_entry() {
            let (deadline, hash) = *entry.key();
            if deadline > now {
                break;
            }
            entry.remove();
            self.by_key.remove(&hash);
        }
    }
}

/**
 * @cc [owner:spolu,label:security] bearer-key-handling
 * Generated credentials MUST use 256 bits from the OS random source. Retain only hashes in storage
 * and session registries; raw keys MUST appear only in creation responses and Authorization headers,
 * never in logs, URLs, or debug formatting. Different credential kinds MUST NOT be interchangeable.
 */
pub(super) fn issue_key(prefix: &str) -> Result<String, ApiError> {
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes).map_err(|_| ApiError::Internal)?;
    Ok(format!("{prefix}{}", hex::encode(bytes)))
}

pub(super) fn fingerprint(key: &str) -> [u8; 32] {
    Sha256::digest(key.as_bytes()).into()
}

pub(super) fn matches_hash(expected: &[u8; 32], key: &str) -> bool {
    bool::from(expected.ct_eq(&fingerprint(key)))
}

/**
 * @cc [owner:spolu,label:security] durable-workspace-authority
 * Workspace administration and session issuance MUST verify the workspace key's kind and hash
 * against durable state for the requested workspace. Missing workspaces and wrong keys MUST both
 * return Unauthenticated, without consulting or exposing that workspace's objects or grants.
 */
pub(super) async fn authorize_workspace(
    storage: &Storage,
    workspace: &WorkspaceId,
    key: &str,
) -> Result<(), ApiError> {
    require_key_kind(key, "dfsw_")?;
    let record = storage
        .workspace_record(workspace)
        .await
        .map_err(|_| ApiError::Unavailable)?;
    if !record.is_some_and(|record| matches_hash(&record.key_hash, key)) {
        return Err(ApiError::Unauthenticated);
    }
    Ok(())
}

pub(super) fn require_key_kind(key: &str, prefix: &str) -> Result<(), ApiError> {
    let suffix = key.strip_prefix(prefix).ok_or(ApiError::Unauthenticated)?;
    if suffix.len() != 64
        || !suffix
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(ApiError::Unauthenticated);
    }
    Ok(())
}

pub(super) fn bearer(headers: &HeaderMap) -> Result<&str, ApiError> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let value = values.next().ok_or(ApiError::Unauthenticated)?;
    if values.next().is_some() {
        return Err(ApiError::Unauthenticated);
    }
    let value = value.to_str().map_err(|_| ApiError::Unauthenticated)?;
    let (scheme, key) = value.split_once(' ').ok_or(ApiError::Unauthenticated)?;
    if !scheme.eq_ignore_ascii_case("Bearer")
        || key.is_empty()
        || key.len() > 512
        || !key.bytes().all(key_character)
    {
        return Err(ApiError::Unauthenticated);
    }
    Ok(key)
}

fn key_character(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn expiration_cleans_both_indexes_and_closure_is_scoped() -> Result<()> {
        let access = Access::new(None)?;
        let workspace = WorkspaceId::new("w")?;
        let (first, first_key) = access
            .create_session(workspace.clone(), BTreeSet::new())
            .await?;
        let (second, second_key) = access.create_session(workspace, BTreeSet::new()).await?;
        assert!(matches!(
            access.close_session(&first_key, &second.id).await,
            Err(ApiError::NotFound)
        ));
        access.close_session(&first_key, &first.id).await?;
        assert!(access.session(&first_key).await.is_err());
        assert!(access.session(&second_key).await.is_ok());
        tokio::time::advance(Duration::from_secs(SESSION_TTL_SECONDS)).await;
        assert!(access.session(&second_key).await.is_err());
        let sessions = access.sessions.lock().await;
        assert!(sessions.by_key.is_empty() && sessions.by_expiry.is_empty());
        Ok(())
    }

    #[test]
    fn server_configuration_and_bearer_headers_fail_closed() -> Result<()> {
        for key in ["", "short", "this-key-contains-a-space-and-is-invalid "] {
            assert!(Access::new(Some(key)).is_err());
        }
        assert_eq!(
            Access::new(None)?.authorize_creation("anything"),
            Err(ApiError::Unavailable)
        );
        let mut headers = HeaderMap::new();
        assert!(bearer(&headers).is_err());
        headers.insert(header::AUTHORIZATION, "Bearer valid-key".parse()?);
        assert_eq!(bearer(&headers)?, "valid-key");
        headers.append(header::AUTHORIZATION, "Bearer second-key".parse()?);
        assert!(bearer(&headers).is_err());
        Ok(())
    }
}
