use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

mod ancestry;
pub mod api;
mod auth;
mod keys;
mod model;
mod mutation;
pub mod network;
mod profile;
mod read;
pub mod storage;
pub mod transport;

pub struct State {
    pub storage: storage::Storage,
    server_hash: [u8; 32],
    sessions: auth::Sessions,
    creation: Mutex<()>,
    admission: Arc<Semaphore>,
    ancestry: Arc<ancestry::Ancestry>,
}
impl State {
    pub fn new(storage: storage::Storage, server_key: &str) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            server_key.len() == 64 && server_key.bytes().all(|b| b.is_ascii_hexdigit()),
            "invalid server key"
        );
        let state = Arc::new(Self {
            storage,
            server_hash: auth::hash(server_key),
            sessions: Default::default(),
            creation: Mutex::new(()),
            admission: Arc::new(Semaphore::new(64)),
            ancestry: Default::default(),
        });
        Ok(state)
    }
    pub async fn drain(&self) -> anyhow::Result<()> {
        let _requests = self.admission.acquire_many(64).await?;
        profile::report();
        Ok(())
    }
}

#[cfg(test)]
mod tests;
