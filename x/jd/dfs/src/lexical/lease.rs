use crate::{engine::Engine, model::*};
use anyhow::Result;
use std::{
    sync::{Arc, mpsc},
    thread::{self, JoinHandle},
    time::Duration,
};

pub(super) struct Lease {
    engine: Arc<Engine>,
    session: Id,
    lease: Id,
    stop: Option<mpsc::Sender<()>>,
    worker: Option<JoinHandle<crate::model::Result<()>>>,
}

impl Lease {
    pub fn new(engine: Arc<Engine>, session: &str, lease: &str) -> Result<Self> {
        let (stop, receiver) = mpsc::channel();
        let mut guard = Self {
            engine: engine.clone(),
            session: session.to_owned(),
            lease: lease.to_owned(),
            stop: Some(stop),
            worker: None,
        };
        let session = session.to_owned();
        let lease = lease.to_owned();
        guard.worker = Some(thread::Builder::new().name("index-lease".into()).spawn(
            move || {
                loop {
                    match receiver.recv_timeout(Duration::from_secs(20)) {
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            engine.renew_index_snapshot(&session, &lease)?;
                        }
                    }
                }
            },
        )?);
        Ok(guard)
    }

    fn stop(&mut self) -> Result<()> {
        drop(self.stop.take());
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .map_err(|_| anyhow::anyhow!("index lease worker panicked"))??;
        }
        Ok(())
    }

    pub fn finish(mut self) -> Result<()> {
        self.stop()?;
        self.engine
            .renew_index_snapshot(&self.session, &self.lease)?;
        self.engine.end_index_snapshot(&self.session, &self.lease)?;
        Ok(())
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        let _ = self.stop();
        let _ = self.engine.end_index_snapshot(&self.session, &self.lease);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{Limits, token_hash};

    #[test]
    fn keeper_outlives_initial_deadline_and_releases_on_finish_or_drop() {
        let directory = tempfile::tempdir().unwrap();
        let engine = Arc::new(
            Engine::open(
                directory.path(),
                vec![Credential {
                    token_hash: token_hash("admin"),
                    tenant: "tenant".into(),
                    issuer: "test".into(),
                    subject: "admin".into(),
                    principal: "admin".into(),
                    admin: true,
                    scope: None,
                    expires_ms: u64::MAX,
                }],
                Limits::default(),
            )
            .unwrap(),
        );
        let session = engine.login("admin").unwrap();
        let snapshot = engine.begin_index_delta(&session.id, None).unwrap();
        let keeper = Lease::new(engine.clone(), &session.id, &snapshot.lease).unwrap();
        thread::sleep(Duration::from_secs(65));
        assert!(now_ms() > snapshot.expires_ms);
        assert!(
            !engine
                .list_index_nodes(&session.id, &snapshot.lease, 0)
                .unwrap()
                .is_empty()
        );
        keeper.finish().unwrap();
        assert!(
            engine
                .renew_index_snapshot(&session.id, &snapshot.lease)
                .is_err()
        );
        for _ in 0..5 {
            let snapshot = engine.begin_index_delta(&session.id, None).unwrap();
            drop(Lease::new(engine.clone(), &session.id, &snapshot.lease).unwrap());
            assert!(
                engine
                    .list_index_nodes(&session.id, &snapshot.lease, 0)
                    .is_err()
            );
        }
        let snapshot = engine.begin_index_delta(&session.id, None).unwrap();
        let keeper = Lease::new(engine.clone(), &session.id, &snapshot.lease).unwrap();
        engine.logout(&session.id);
        assert!(keeper.finish().is_err());
    }
}
