use super::*;
use crate::storage::{commit, memory::Database};
use anyhow::Context;

#[tokio::test]
async fn allocation_is_stable_tenant_scoped_and_conflict_tracked() -> anyhow::Result<()> {
    let db = Database::default();
    let keys = Keys::new("first")?;
    let names = ["future".into(), "owner".into()].into();
    let a = db.snapshot();
    let b = db.snapshot();
    let first = intern(&a, &keys, &names).await?;
    intern(&b, &keys, &["different".into()].into()).await?;
    commit(a).await?;
    assert!(
        commit(b)
            .await
            .err()
            .context("allocator conflict")?
            .is_retryable_not_committed()
    );
    let retry = db.snapshot();
    let different = intern(&retry, &keys, &["different".into()].into()).await?;
    commit(retry).await?;
    assert!(!first.values().any(|id| *id == different["different"]));
    let same = db.snapshot();
    assert_eq!(intern(&same, &keys, &names).await?, first);
    assert_eq!(commit(same).await?, -1, "existing grants require no writes");
    assert_eq!(
        name(&db.snapshot(), &keys, first["future"]).await?,
        "future"
    );
    let other = Keys::new("second")?;
    assert!(resolve(&db.snapshot(), &other, &names).await?.is_empty());
    let separate = db.snapshot();
    assert_eq!(
        intern(&separate, &other, &["owner".into()].into()).await?["owner"],
        GrantId(1)
    );
    commit(separate).await?;
    Ok(())
}

#[tokio::test]
async fn exhaustion_does_not_wrap_or_publish_partial_dictionary() -> anyhow::Result<()> {
    let db = Database::default();
    let keys = Keys::new("exhausted")?;
    let snapshot = db.snapshot();
    let mut batch = WriteBatch::new();
    batch.put(keys.grant_next(), (u32::MAX - 1).to_be_bytes());
    batch.apply(&snapshot)?;
    commit(snapshot).await?;
    let snapshot = db.snapshot();
    let result = intern(&snapshot, &keys, &["a".into(), "b".into()].into()).await;
    assert_eq!(
        result.err().context("exhaustion")?.code(),
        tonic::Code::ResourceExhausted
    );
    assert_eq!(commit(snapshot).await?, -1);
    assert!(db.snapshot().get(keys.grant_name("a")).await?.is_none());
    let last = db.snapshot();
    assert_eq!(
        intern(&last, &keys, &["a".into()].into()).await?["a"],
        GrantId(u32::MAX)
    );
    commit(last).await?;
    Ok(())
}
