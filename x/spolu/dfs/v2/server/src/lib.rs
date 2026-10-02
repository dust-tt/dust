use std::{collections::HashMap, sync::Arc};
use tokio::sync::{Mutex, Semaphore};

mod ancestry;
pub mod api;
mod auth;
mod keys;
mod model;
mod mutation;
pub mod network;
mod read;
pub mod search;
pub mod storage;
pub mod transport;

pub struct State {
    pub storage: storage::Storage,
    pub search: tokio::sync::OnceCell<Arc<search::Search>>,
    server_hash: [u8; 32],
    sessions: auth::Sessions,
    locks: Mutex<HashMap<String, Arc<auth::WorkspaceLocks>>>,
    creation: Mutex<()>,
    admission: Arc<Semaphore>,
    ancestry: Arc<ancestry::Ancestry>,
}
impl State {
    pub fn new(storage: storage::Storage, server_key: &str) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            server_key.len() == 64 && server_key.bytes().all(|v| v.is_ascii_hexdigit()),
            "server key must be 64 hexadecimal characters"
        );
        Ok(Arc::new(Self {
            storage,
            search: tokio::sync::OnceCell::new(),
            server_hash: auth::hash(server_key),
            sessions: Default::default(),
            locks: Default::default(),
            creation: Mutex::new(()),
            admission: Arc::new(Semaphore::new(64)),
            ancestry: Default::default(),
        }))
    }
}

impl State {
    pub async fn drain(&self) -> anyhow::Result<()> {
        if let Some(search) = self.search.get() {
            search.stop().await?;
        }
        let _requests = self.admission.acquire_many(64).await?;
        Ok(())
    }
}

#[test]
fn local_backend_contracts() -> anyhow::Result<()> {
    network::run(async {
        ancestry::tests::concurrent_authority_changes_abort_hinted_writes().await?;
        auth::tests::workspace_lock_pruning_preserves_active_gates_and_bounds_idle_entries()
            .await?;
        api::tests::cancelled_write_keeps_guards_until_publication_before_close_and_revocation()
            .await?;
        search::tests::run().await
    })
}
