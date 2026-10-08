use super::*;
use crate::{
    keys::Keys,
    model::{self, Record, TenantRecord},
    mutation::{Change, Edit, prepare_group},
    read::View,
};
use anyhow::{Context, Result};
use dfs_protocol::{ObjectRef, rpc::*};

async fn setup() -> Result<(Database, ObjectRef)> {
    let database = Database::default();
    let root = Record {
        object: model::new_object(true, 0o755)?,
        parent: None,
        revision: [1; 16],
    };
    let snapshot = database.snapshot();
    let keys = Keys::new("memory")?;
    let mut edit = Edit::new();
    edit.record(&keys, &root)?;
    let grants = crate::grants::intern(&snapshot, &keys, &["owner".into()].into()).await?;
    edit.grant(&keys, &root.object.id, grants["owner"], "owner", true)?;
    edit.put(
        keys.tenant(),
        encode(&TenantRecord {
            root: root.object.id,
            key_hash: [0; 32],
        })?,
    )?;
    edit.batch.apply(&snapshot)?;
    crate::tree_log::publish(&snapshot, &keys, &[root.object.id].into()).await?;
    commit(snapshot).await?;
    Ok((database, root.object.id))
}
async fn view(snapshot: Arc<Snapshot>) -> Result<View> {
    Ok(View::from_snapshot(snapshot, "memory", ["owner".into()].into()).await?)
}
fn create(parent: ObjectRef, name: &str) -> Change {
    Change::Create(CreateRequest {
        parent_id: parent,
        name: name.into(),
        object_id: ObjectRef::new_v4(),
        mode: 0o644,
        ..Default::default()
    })
}
#[tokio::test]
async fn sibling_commits_merge_but_name_collisions_conflict() -> Result<()> {
    let (database, root) = setup().await?;
    let a = view(database.snapshot()).await?;
    let b = view(database.snapshot()).await?;
    let left = prepare_group(&a, &[create(root, "a")]).await?;
    prepare_group(&b, &[create(root, "b")]).await?;
    commit(a.snapshot).await?;
    commit(b.snapshot).await?;
    let page = view(database.snapshot())
        .await?
        .list(&root, None, 4096)
        .await?;
    assert_eq!(
        page.entries
            .iter()
            .map(|e| e.name.as_str())
            .collect::<Vec<_>>(),
        ["a", "b"]
    );
    let a = view(database.snapshot()).await?;
    let b = view(database.snapshot()).await?;
    prepare_group(&a, &[create(root, "same")]).await?;
    prepare_group(&b, &[create(root, "same")]).await?;
    commit(a.snapshot).await?;
    assert!(
        commit(b.snapshot)
            .await
            .err()
            .context("collision")?
            .is_retryable_not_committed()
    );
    let object = left.object.context("created")?;
    let old = view(database.snapshot()).await?;
    let writer = view(database.snapshot()).await?;
    prepare_group(
        &writer,
        &[Change::Write(WriteRequest {
            object_id: object.id,
            data: b"changed".to_vec(),
            ..Default::default()
        })],
    )
    .await?;
    commit(writer.snapshot).await?;
    assert_eq!(
        old.stat(&object.id).await?.object.size,
        0,
        "snapshots remain fixed across commits"
    );
    assert_eq!(
        view(database.snapshot())
            .await?
            .stat(&object.id)
            .await?
            .object
            .size,
        7
    );
    Ok(())
}
#[tokio::test]
async fn failed_groups_and_phantom_conflicts_publish_nothing() -> Result<()> {
    let (database, root) = setup().await?;
    let transaction = view(database.snapshot()).await?;
    let result = prepare_group(&transaction, &[create(root, "file")]).await?;
    let id = result.object.context("file")?.id;
    commit(transaction.snapshot).await?;
    let transaction = view(database.snapshot()).await?;
    assert!(
        prepare_group(
            &transaction,
            &[
                Change::Write(WriteRequest {
                    object_id: id,
                    data: b"uncommitted".to_vec(),
                    ..Default::default()
                }),
                Change::Update(UpdateRequest {
                    object_id: id,
                    size: Some(u64::MAX),
                    ..Default::default()
                }),
            ]
        )
        .await
        .is_err()
    );
    drop(transaction);
    assert_eq!(
        view(database.snapshot())
            .await?
            .stat(&id)
            .await?
            .object
            .size,
        0
    );
    let reader = database.snapshot();
    assert!(
        reader
            .range(b"phantom/", b"phantom0", 1)
            .await?
            .0
            .is_empty()
    );
    let other = database.snapshot();
    let mut batch = WriteBatch::new();
    batch.put(b"phantom/created", b"present");
    batch.apply(&other)?;
    commit(other).await?;
    let mut batch = WriteBatch::new();
    batch.put(b"dependent", b"must-not-commit");
    batch.apply(&reader)?;
    assert!(
        commit(reader)
            .await
            .err()
            .context("phantom")?
            .is_retryable_not_committed()
    );
    assert!(database.snapshot().get(b"dependent").await?.is_none());
    Ok(())
}
#[tokio::test]
async fn atomic_increments_merge_and_deduplicate_within_each_group() -> Result<()> {
    let database = Database::default();
    let a = database.snapshot();
    let b = database.snapshot();
    let mut batch = WriteBatch::new();
    batch.increment(b"counter");
    batch.increment(b"counter");
    batch.apply(&a)?;
    batch.apply(&b)?;
    commit(a).await?;
    commit(b).await?;
    let value = database
        .snapshot()
        .get(b"counter")
        .await?
        .context("counter")?;
    assert_eq!(value.as_ref(), 2i64.to_le_bytes());
    Ok(())
}

#[tokio::test]
async fn stamped_operands_are_unreadable_until_commit_and_atomic_values_merge() -> Result<()> {
    let database = Database::default();
    let transaction = database.snapshot();
    let mut batch = WriteBatch::new();
    let key = [b"log/".as_slice(), &[255; 10], b"/object"].concat();
    let value = [b"prefix/".as_slice(), &[255; 10], b"/value"].concat();
    batch.stamped_key(key, b"image", 4);
    batch.stamped_value(b"head".to_vec(), value, 7);
    batch.apply(&transaction)?;
    assert!(transaction.get(b"head").await.is_err());
    assert!(transaction.range(b"log/", b"log0", 10).await.is_err());
    let version = commit(transaction).await?;
    let mut stamp = [0; 10];
    stamp[..8].copy_from_slice(&version.to_be_bytes());
    let read = database.snapshot();
    let key = [b"log/".as_slice(), &stamp, b"/object"].concat();
    assert_eq!(
        read.get(&key).await?.context("stamped key")?.as_ref(),
        b"image"
    );
    let head = read.get(b"head").await?.context("stamped value")?;
    assert_eq!(&head[7..17], &stamp);
    let a = database.snapshot();
    let b = database.snapshot();
    for (transaction, max, delta) in [(&a, 9u64, 7), (&b, 3, -2)] {
        let mut batch = WriteBatch::new();
        batch.byte_max(b"max", max.to_be_bytes());
        batch.add(b"add", delta);
        batch.apply(transaction)?;
    }
    commit(a).await?;
    commit(b).await?;
    let read = database.snapshot();
    assert_eq!(
        read.get(b"max").await?.context("max")?.as_ref(),
        9u64.to_be_bytes()
    );
    assert_eq!(
        read.get(b"add").await?.context("add")?.as_ref(),
        5i64.to_le_bytes()
    );
    let invalid = database.snapshot();
    let mut batch = WriteBatch::new();
    batch.put(b"not-applied", b"value");
    batch.stamped_value(b"bad-offset".to_vec(), [255; 10], usize::MAX);
    assert!(batch.apply(&invalid).is_err());
    assert_eq!(commit(invalid).await?, -1);
    Ok(())
}
