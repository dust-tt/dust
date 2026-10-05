use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

mod ancestry;
pub mod api;
mod auth;
pub mod cache;
mod keys;
mod model;
mod mutation;
pub mod network;
mod read;
pub mod storage;
pub mod transport;

pub struct State {
    pub storage: storage::Storage,
    pub cache: Arc<cache::Cache>,
    server_hash: [u8; 32],
    sessions: auth::Sessions,
    creation: Mutex<()>,
    admins: Mutex<std::collections::HashMap<String, Arc<auth::SessionState>>>,
    admission: Arc<Semaphore>,
    ancestry: Arc<ancestry::Ancestry>,
}
impl State {
    pub fn new(
        storage: storage::Storage,
        server_key: &str,
        config: cache::CacheConfig,
    ) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            server_key.len() == 64 && server_key.bytes().all(|b| b.is_ascii_hexdigit()),
            "invalid server key"
        );
        let cache = cache::Cache::new(storage.clone(), config)?;
        let state = Arc::new(Self {
            storage,
            cache,
            server_hash: auth::hash(server_key),
            sessions: Default::default(),
            creation: Mutex::new(()),
            admins: Default::default(),
            admission: Arc::new(Semaphore::new(64)),
            ancestry: Default::default(),
        });
        state.cache.start();
        Ok(state)
    }
    pub async fn drain(&self) -> anyhow::Result<()> {
        let _requests = self.admission.acquire_many(64).await?;
        self.cache.drain().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
