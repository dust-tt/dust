mod elastic;
pub mod http;
mod query;
pub use query::{Authority, Query, Request, Response, Search};
pub mod worker;

use crate::{
    engine::{Engine, indexing::IndexPlan},
    objects::{hash, hex},
};
use anyhow::{Result, ensure};
use futures::{StreamExt, TryStreamExt};
use serde::Serialize;
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;

pub struct Indexer {
    engine: Arc<Engine>,
    elastic: elastic::Elastic,
    admission: Semaphore,
    checkpoint_pause: Option<(u64, std::path::PathBuf)>,
}

pub struct Prepared {
    index: String,
    plan: IndexPlan,
}

#[derive(Debug, Serialize)]
pub struct Progress {
    pub index: String,
    pub through: u64,
    pub source_head: u64,
    pub documents: usize,
    pub advanced: bool,
}

impl Indexer {
    pub fn new(engine: Arc<Engine>, endpoints: Vec<String>) -> Result<Self> {
        Ok(Self {
            engine,
            elastic: elastic::Elastic::new(endpoints)?,
            admission: Semaphore::new(2),
            checkpoint_pause: None,
        })
    }

    pub fn with_checkpoint_pause(mut self, pause: Option<(u64, std::path::PathBuf)>) -> Self {
        self.checkpoint_pause = pause;
        self
    }

    pub async fn prepare(&self, session: &str) -> Result<Prepared> {
        self.prepare_limit(session, 1024).await
    }

    async fn prepare_limit(&self, session: &str, limit: usize) -> Result<Prepared> {
        let caller = self.engine.session(session).await?;
        ensure!(
            caller.admin && caller.scope.is_none(),
            "indexing requires unscoped administrator"
        );
        let index = index_name(&self.engine.incarnation, &caller.tenant)?;
        let uuid = self.elastic.ensure_index(&index).await?;
        let plan = self.engine.prepare_index(session, &uuid, limit).await?;
        Ok(Prepared { index, plan })
    }

    pub async fn apply(&self, prepared: Prepared) -> Result<Progress> {
        let _permit = self
            .admission
            .try_acquire()
            .map_err(|_| anyhow::anyhow!("indexing admission"))?;
        tokio::time::timeout(Duration::from_secs(120), self.apply_inner(prepared)).await?
    }

    async fn apply_inner(&self, prepared: Prepared) -> Result<Progress> {
        let Prepared { index, plan } = prepared;
        let caller = self.engine.session(&plan.session).await?;
        ensure!(
            caller.admin && caller.scope.is_none() && caller.tenant == plan.tenant,
            "index authority changed"
        );
        let version = plan
            .source_head
            .checked_add(1)
            .filter(|v| *v <= i64::MAX as u64)
            .ok_or_else(|| anyhow::anyhow!("index version overflow"))?;
        let mut entries = Vec::new();
        let mut bytes = 0usize;
        let plan_ref = &plan;
        let documents = futures::stream::iter(plan.nodes.clone())
            .map(|node| async move {
                let document = self.engine.index_document(plan_ref, &node).await?;
                Ok::<_, crate::model::Error>((node, document))
            })
            .buffered(8);
        futures::pin_mut!(documents);
        while let Some((node, document)) = documents.try_next().await? {
            let mut entry = serde_json::to_vec(&json!({"index":{
                "_id": node, "version":version, "version_type":"external_gte"
            }}))?;
            entry.push(b'\n');
            serde_json::to_writer(&mut entry, &document)?;
            entry.push(b'\n');
            bytes = bytes.saturating_add(entry.len());
            if bytes > 64 << 20 {
                return Err(crate::model::err(libc::E2BIG, "index materialization bytes").into());
            }
            entries.push(entry);
        }
        let mut body = Vec::new();
        let mut count = 0;
        for entry in entries {
            if !body.is_empty() && body.len().saturating_add(entry.len()) > 2 << 20 {
                self.elastic
                    .bulk(&index, std::mem::take(&mut body), count)
                    .await?;
                count = 0;
            }
            body.extend(entry);
            count += 1;
        }
        if !body.is_empty() {
            self.elastic.bulk(&index, body, count).await?;
        }
        if !plan.nodes.is_empty() {
            self.elastic.refresh(&index).await?;
        }
        ensure!(
            self.elastic.index_uuid(&index).await? == plan.next.uuid,
            "index replaced during publication"
        );
        if let Some((head, path)) = &self.checkpoint_pause
            && plan.next.head >= *head
        {
            tokio::fs::write(path, plan.next.head.to_string()).await?;
            std::future::pending::<()>().await;
        }
        let advanced = if plan.expected.as_ref() == Some(&plan.next) {
            false
        } else {
            self.engine.finish_index(&plan).await?
        };
        Ok(Progress {
            index,
            through: plan.next.head,
            source_head: plan.source_head,
            documents: plan.nodes.len(),
            advanced,
        })
    }

    pub async fn sync_once(&self, session: &str) -> Result<Progress> {
        let mut limit = 1024;
        loop {
            let result =
                async { self.apply(self.prepare_limit(session, limit).await?).await }.await;
            match result {
                Err(error)
                    if limit > 1
                        && error
                            .downcast_ref::<crate::model::Error>()
                            .is_some_and(|error| {
                                matches!(error.code, libc::E2BIG | libc::ETIMEDOUT)
                            }) =>
                {
                    limit = (limit / 4).max(1);
                }
                other => return other,
            }
        }
    }
}

pub fn index_name(incarnation: &str, tenant: &str) -> Result<String> {
    Ok(format!(
        "dfs-v2-{}",
        hex(&hash(&bincode::serialize(&(incarnation, tenant))?))
    ))
}
