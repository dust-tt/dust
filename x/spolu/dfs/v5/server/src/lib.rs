use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

pub mod api;
mod auth;
use dfs_core::keys;
use dfs_core::model;
use dfs_core::mutation;
pub mod network;
pub mod permissions;
use dfs_core::profile;
use dfs_core::read;
pub mod storage;
pub mod transport;
pub mod tree_feed;
pub mod tree_gc;

pub struct State {
    pub storage: storage::Storage,
    server_hash: [u8; 32],
    incarnation: dfs_protocol::Revision,
    sessions: auth::Sessions,
    creation: Mutex<()>,
    admission: Arc<Semaphore>,
    mutations: Arc<Semaphore>,
    batches: Arc<Semaphore>,
    tree_log_limits: dfs_core::tree_log::Limits,
    permissions: Arc<permissions::Manager>,
    #[cfg(test)]
    pauses: tests::Pauses,
    #[cfg(test)]
    prepare_pauses: tests::Pauses,
    #[cfg(test)]
    reply_pauses: tests::Pauses,
    #[cfg(test)]
    list_reply_pauses: tests::Pauses,
    #[cfg(test)]
    content_reply_pauses: tests::Pauses,
}
impl State {
    pub fn new(storage: storage::Storage, server_key: &str) -> anyhow::Result<Arc<Self>> {
        Self::with_tree_log_limits(storage, server_key, Default::default())
    }
    pub fn with_tree_log_limits(
        storage: storage::Storage,
        server_key: &str,
        tree_log_limits: dfs_core::tree_log::Limits,
    ) -> anyhow::Result<Arc<Self>> {
        Self::with_config(storage, server_key, tree_log_limits, Default::default())
    }
    pub fn with_config(
        storage: storage::Storage,
        server_key: &str,
        tree_log_limits: dfs_core::tree_log::Limits,
        permission_config: permissions::Config,
    ) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            server_key.len() == 64 && server_key.bytes().all(|b| b.is_ascii_hexdigit()),
            "invalid server key"
        );
        let state = Arc::new(Self {
            permissions: permissions::Manager::new(permission_config)?,
            storage,
            server_hash: auth::hash(server_key),
            incarnation: dfs_protocol::Revision::new(),
            sessions: Default::default(),
            creation: Mutex::new(()),
            admission: Arc::new(Semaphore::new(64)),
            mutations: Arc::new(Semaphore::new(1024)),
            batches: Arc::new(Semaphore::new(32)),
            tree_log_limits,
            #[cfg(test)]
            pauses: Default::default(),
            #[cfg(test)]
            prepare_pauses: Default::default(),
            #[cfg(test)]
            reply_pauses: Default::default(),
            #[cfg(test)]
            list_reply_pauses: Default::default(),
            #[cfg(test)]
            content_reply_pauses: Default::default(),
        });
        tokio::spawn(state.permissions.clone().run(Arc::downgrade(&state)));
        Ok(state)
    }
    pub async fn drain(&self) -> anyhow::Result<()> {
        self.permissions.stop();
        let _batches = self.batches.acquire_many(32).await?;
        let _mutations = self.mutations.acquire_many(1024).await?;
        let _requests = self.admission.acquire_many(64).await?;
        profile::report();
        Ok(())
    }
    pub fn transaction_admission(&self) -> Arc<Semaphore> {
        self.admission.clone()
    }
}

#[cfg(test)]
mod tests;
