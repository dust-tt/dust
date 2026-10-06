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

type Scheduling =
    parking_lot::Mutex<std::collections::HashMap<(String, String), std::sync::Weak<Mutex<()>>>>;

pub struct State {
    pub storage: storage::Storage,
    server_hash: [u8; 32],
    sessions: auth::Sessions,
    creation: Mutex<()>,
    admission: Arc<Semaphore>,
    ancestry: Arc<ancestry::Ancestry>,
    scheduling: Scheduling,
    #[cfg(test)]
    pauses: tests::Pauses,
    #[cfg(test)]
    reply_pauses: tests::Pauses,
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
            scheduling: Default::default(),
            #[cfg(test)]
            pauses: Default::default(),
            #[cfg(test)]
            reply_pauses: Default::default(),
        });
        Ok(state)
    }
    /// @cc [owner:spolu,label:concurrency;performance] advisory-object-scheduling
    /// Local scheduling MAY serialize the same primary object to reduce self-conflicts. It MUST NOT
    /// replace fresh FDB conflict checks, coordinate whole tenants, or acknowledge a pending commit.
    fn schedule(&self, tenant: &str, id: &str) -> Arc<Mutex<()>> {
        let mut scheduling = self.scheduling.lock();
        if scheduling.len() >= 4096 {
            scheduling.retain(|_, gate| gate.strong_count() > 0);
        }
        let slot = scheduling.entry((tenant.into(), id.into())).or_default();
        if let Some(gate) = slot.upgrade() {
            return gate;
        }
        let gate = Arc::new(Mutex::new(()));
        *slot = Arc::downgrade(&gate);
        gate
    }
    pub async fn drain(&self) -> anyhow::Result<()> {
        let _requests = self.admission.acquire_many(64).await?;
        profile::report();
        Ok(())
    }
}

#[cfg(test)]
mod tests;
