use std::{collections::HashMap, sync::Arc};
use tokio::sync::{Mutex, Semaphore};

mod ancestry;
pub mod api;
mod auth;
mod keys;
mod model;
mod mutation;
pub mod network;
mod patch;
mod read;
pub mod search;
pub mod storage;
pub mod transport;
pub mod writeback;

pub struct State {
    pub storage: storage::Storage,
    pub search: tokio::sync::OnceCell<Arc<search::Search>>,
    server_hash: [u8; 32],
    sessions: auth::Sessions,
    locks: Mutex<HashMap<String, Arc<auth::WorkspaceLocks>>>,
    creation: Mutex<()>,
    admission: Arc<Semaphore>,
    ancestry: Arc<ancestry::Ancestry>,
    pub(crate) writeback: Arc<writeback::Writeback>,
}
impl State {
    pub fn new(storage: storage::Storage, server_key: &str) -> anyhow::Result<Arc<Self>> {
        Self::with_writeback(storage, server_key, writeback::WritebackConfig::default())
    }
    pub fn new_durable(storage: storage::Storage, server_key: &str) -> anyhow::Result<Arc<Self>> {
        Self::with_writeback(storage, server_key, writeback::WritebackConfig::disabled())
    }
    pub fn with_writeback(
        storage: storage::Storage,
        server_key: &str,
        config: writeback::WritebackConfig,
    ) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            server_key.len() == 64 && server_key.bytes().all(|v| v.is_ascii_hexdigit()),
            "server key must be 64 hexadecimal characters"
        );
        let state = Arc::new(Self {
            storage,
            search: tokio::sync::OnceCell::new(),
            server_hash: auth::hash(server_key),
            sessions: Default::default(),
            locks: Default::default(),
            creation: Mutex::new(()),
            admission: Arc::new(Semaphore::new(64)),
            ancestry: Default::default(),
            writeback: Arc::new(writeback::Writeback::new(config)?),
        });
        state.writeback.start(Arc::downgrade(&state))?;
        Ok(state)
    }
}

impl State {
    pub async fn drain(&self) -> anyhow::Result<()> {
        let _requests = self.admission.acquire_many(64).await?;
        let publication = self.writeback.drain(self).await;
        if let Some(search) = self.search.get() {
            search.stop().await?;
        }
        self.storage.log_counters();
        publication?;
        Ok(())
    }
}

#[test]
fn local_backend_contracts() -> anyhow::Result<()> {
    network::run(async {
        storage::tests::speculative_failure_preserves_application_errors().await?;
        storage::tests::fresh_attempts_observe_other_writers().await?;
        storage::tests::version_tokens_survive_independent_writers_and_reopen().await?;
        writeback::tests::ambiguous_publication_is_not_replayed().await?;
        ancestry::tests::concurrent_changes_abort_prefetched_writes().await?;
        mutation::tests::unused_block_errors_do_not_override_read_checks().await?;
        auth::tests::workspace_lock_pruning_preserves_active_gates_and_bounds_idle_entries()
            .await?;
        api::tests::cancelled_write_keeps_guards_until_publication_before_close_and_revocation()
            .await?;
        api::tests::object_locks_isolate_publication_and_revalidate_discovery().await?;
        search::tests::run().await
    })
}
