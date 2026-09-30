use crate::{
    api::ApiError,
    model::WorkspaceId,
    storage::{MetadataMutation, ReadView, Storage},
};

const MAX_ATTEMPTS: usize = 16;

/**
 * @cc [owner:spolu,label:security;concurrency] optimistic-namespace-mutation
 * Preparation MUST only read its supplied snapshot and build a complete mutation batch; it may be
 * repeated and MUST NOT publish or perform external side effects. Lock every touched object/parent
 * in workspace/ID order before publication. Validate the snapshot sequence under publication for
 * successes, no-ops, and errors so queued requests cannot disclose stale conflicts after revocation.
 * A stale attempt MUST release all locks, reread, reauthorize, and rediscover its lock set. Limit
 * retries to 16 attempts, then return Conflict without publication. Release object/publication locks
 * before durability waits. Never retry an error after submission, whose outcome may be ambiguous.
 */
pub(super) async fn mutate<T, F, Fut>(
    storage: &Storage,
    workspace: &WorkspaceId,
    prepare: F,
) -> Result<T, ApiError>
where
    F: Fn(ReadView) -> Fut + Send + Sync,
    Fut: Future<Output = Result<(T, Vec<MetadataMutation>), ApiError>> + Send,
    T: Send,
{
    let scoped = storage
        .workspace(workspace)
        .map_err(|_| ApiError::Unavailable)?;
    for _ in 0..MAX_ATTEMPTS {
        let view = scoped
            .read_view()
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let (output, mutations) = match prepare(view.clone()).await {
            Ok(prepared) => prepared,
            Err(error) => {
                let writer = scoped.begin_metadata_write().await;
                if writer
                    .is_current(&view)
                    .await
                    .map_err(|_| ApiError::Unavailable)?
                {
                    return Err(error);
                }
                continue;
            }
        };
        let prepared = scoped
            .prepare_metadata(&view, mutations)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let locks = scoped
            .lock_objects(&prepared.object_ids())
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let writer = scoped.begin_metadata_write().await;
        let published = writer
            .try_publish(prepared)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        drop(locks);
        if let Some(published) = published {
            published
                .await_durable()
                .await
                .map_err(|_| ApiError::Unavailable)?;
            return Ok(output);
        }
    }
    Err(ApiError::Conflict)
}

#[cfg(test)]
mod tests {
    use anyhow::{Context, Result, ensure};
    use slatedb::object_store::memory::InMemory;
    use std::{
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
        time::Duration,
    };
    use tokio::sync::Semaphore;

    use super::*;
    use crate::namespace::update_grants;

    #[tokio::test]
    async fn slow_preparation_allows_publication_and_retries_from_fresh_state() -> Result<()> {
        let storage = Storage::open(Arc::new(InMemory::new()), &"slow-prepare".parse()?).await?;
        let workspace = WorkspaceId::new("w")?;
        let root = storage
            .create_workspace(&workspace, [0; 32], &Default::default())
            .await?
            .context("root")?;
        let ready = &Semaphore::new(0);
        let resume = &Semaphore::new(0);
        let calls = &AtomicUsize::new(0);
        let mutation = mutate(&storage, &workspace, |view| async move {
            let mut object = view
                .object(root)
                .await
                .map_err(|_| ApiError::Unavailable)?
                .ok_or(ApiError::NotFound)?;
            if calls.fetch_add(1, Ordering::SeqCst) == 0 {
                ready.add_permits(1);
                resume
                    .acquire()
                    .await
                    .map_err(|_| ApiError::Unavailable)?
                    .forget();
            }
            object.metadata_revision = object
                .metadata_revision
                .next()
                .map_err(|_| ApiError::CapacityExhausted)?;
            object.posix.mode = 0;
            Ok((
                object.metadata_revision,
                vec![MetadataMutation::PutObject(object.into())],
            ))
        });
        let competitor = async {
            ready.acquire().await?.forget();
            let revision = update_grants(
                &storage,
                &workspace,
                root,
                0,
                [("other".to_owned(), true)].into(),
            )
            .await?;
            resume.add_permits(1);
            Ok::<_, anyhow::Error>(revision)
        };
        let (result, other) = tokio::time::timeout(Duration::from_secs(5), async {
            tokio::join!(mutation, competitor)
        })
        .await?;
        ensure!(other?.get() == 1 && result?.get() == 2 && calls.load(Ordering::SeqCst) == 2);
        let view = storage.workspace(&workspace)?.read_view().await?;
        ensure!(view.object(root).await?.context("root")?.posix.mode == 0);
        ensure!(view.grants(root, None, 10).await? == ["other"]);
        ensure!(view.changes(1, 10).await?.len() == 2);
        drop(view);
        storage.close().await
    }

    #[tokio::test]
    async fn repeated_interference_is_bounded_and_noops_never_emit_events() -> Result<()> {
        let storage = Storage::open(Arc::new(InMemory::new()), &"retry-limit".parse()?).await?;
        let workspace = WorkspaceId::new("w")?;
        let root = storage
            .create_workspace(&workspace, [0; 32], &Default::default())
            .await?
            .context("root")?;
        let ready = Semaphore::new(0);
        let resume = Semaphore::new(0);
        let mutation = mutate(&storage, &workspace, |_| async {
            ready.add_permits(1);
            resume
                .acquire()
                .await
                .map_err(|_| ApiError::Unavailable)?
                .forget();
            Ok(((), Vec::new()))
        });
        let competitor = async {
            for revision in 0..MAX_ATTEMPTS {
                ready.acquire().await?.forget();
                update_grants(
                    &storage,
                    &workspace,
                    root,
                    u64::try_from(revision)?,
                    [("other".to_owned(), true)].into(),
                )
                .await?;
                resume.add_permits(1);
            }
            Ok::<_, anyhow::Error>(())
        };
        let (result, other) = tokio::time::timeout(Duration::from_secs(10), async {
            tokio::join!(mutation, competitor)
        })
        .await?;
        other?;
        ensure!(result == Err(ApiError::Conflict));
        let view = storage.workspace(&workspace)?.read_view().await?;
        ensure!(view.changes(1, 100).await?.len() == MAX_ATTEMPTS);
        ensure!(
            view.object(root)
                .await?
                .context("root")?
                .metadata_revision
                .get()
                == u64::try_from(MAX_ATTEMPTS)?
        );
        drop(view);
        storage.close().await
    }
}
