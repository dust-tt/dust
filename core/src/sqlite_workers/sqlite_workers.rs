use anyhow::{anyhow, Result};

use crate::utils;

const HEARTBEAT_INTERVAL_MS: u64 = 3_000;

pub struct SqliteWorker {
    last_heartbeat: u64,
    pod_name: String,
}

impl SqliteWorker {
    pub fn new(pod_name: String, last_heartbeat: u64) -> Self {
        Self {
            last_heartbeat: last_heartbeat,
            pod_name,
        }
    }

    pub fn is_alive(&self) -> bool {
        let now = utils::now();
        let elapsed = now - self.last_heartbeat;

        elapsed < HEARTBEAT_INTERVAL_MS
    }

    pub fn url(&self) -> Result<String> {
        let cluster_namespace = match std::env::var("CLUSTER_NAMESPACE") {
            Ok(n) => n,
            Err(_) => Err(anyhow!("CLUSTER_NAMESPACE env var not set"))?,
        };
        let core_sqlite_headless_service_name =
            match std::env::var("CORE_SQLITE_HEADLESS_SERVICE_NAME") {
                Ok(s) => s,
                Err(_) => Err(anyhow!("CORE_SQLITE_HEADLESS_SERVICE_NAME env var not set"))?,
            };

        Ok(format!(
            "http://{}.{}.{}.svc.cluster.local",
            self.pod_name, core_sqlite_headless_service_name, cluster_namespace
        ))
    }
}
