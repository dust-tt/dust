use super::Indexer;
use crate::{
    engine::Engine,
    model::{Session, now_ms},
};
use anyhow::{Result, ensure};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tokio::task::JoinHandle;

pub fn start(
    engine: Arc<Engine>,
    endpoints: Vec<String>,
    tokens: Vec<PathBuf>,
    pause: Option<(u64, PathBuf)>,
) -> Result<JoinHandle<()>> {
    ensure!(
        !tokens.is_empty() && tokens.len() <= 64,
        "index worker token capacity"
    );
    let indexer = Indexer::new(engine.clone(), endpoints)?.with_checkpoint_pause(pause);
    Ok(tokio::spawn(async move {
        let mut sessions: Vec<Option<Session>> = vec![None; tokens.len()];
        loop {
            let mut backlog = false;
            for (position, path) in tokens.iter().enumerate() {
                let result = tokio::time::timeout(Duration::from_secs(130), async {
                    if sessions[position]
                        .as_ref()
                        .is_some_and(|session| session.expires_ms <= now_ms() + 30_000)
                        && let Some(old) = sessions[position].take()
                    {
                        engine.logout(&old.id).await?;
                    }
                    if sessions[position].is_none() {
                        let bytes = tokio::fs::read(path).await?;
                        ensure!(bytes.len() <= 4096, "index credential length");
                        let token = std::str::from_utf8(&bytes)?.trim();
                        sessions[position] = Some(engine.login(token).await?);
                    }
                    let session = sessions[position]
                        .as_ref()
                        .ok_or_else(|| anyhow::anyhow!("index session absent"))?;
                    let progress = indexer.sync_once(&session.id).await?;
                    if progress.advanced {
                        tracing::info!(tenant = %session.tenant, through = progress.through,
                            source_head = progress.source_head, documents = progress.documents,
                            "index checkpoint advanced");
                    }
                    Ok::<_, anyhow::Error>(
                        progress.advanced && progress.through < progress.source_head,
                    )
                })
                .await;
                match result {
                    Ok(Ok(more)) => backlog |= more,
                    Ok(Err(error)) => {
                        if error
                            .downcast_ref::<crate::model::Error>()
                            .is_some_and(|error| matches!(error.code, libc::EACCES | libc::ESTALE))
                            && let Some(old) = sessions[position].take()
                        {
                            let _ = engine.logout(&old.id).await;
                        }
                        tracing::warn!(slot = position, error = %error, "index pass failed; shared checkpoint retained");
                    }
                    Err(_) => tracing::warn!(
                        slot = position,
                        "index pass deadline; shared checkpoint retained"
                    ),
                }
            }
            if backlog {
                tokio::task::yield_now().await;
            } else {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }))
}
