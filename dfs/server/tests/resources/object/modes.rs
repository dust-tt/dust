use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        keys::tenant_subspace,
        object::{self, Mode, ObjectResource, TreeHints},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{GrantUpdate, ObjectKind},
};
use foundationdb::{
    FdbBindingError, FdbError, RangeOption, Transaction,
    tuple::{pack, unpack},
};

use super::{
    StoredObject,
    grants::{allow, deny},
};

fn child(tenant: &TenantResource, parent_id: ObjectId) -> Result<ObjectResource> {
    let mut object = ObjectResource::new_root(tenant)?;
    object.object_id = ObjectId::new_v7();
    object.parent_id = Some(parent_id);
    object.name = object.object_id.to_string();
    Ok(object)
}

async fn set_parent(
    tx: &Transaction,
    tenant: &TenantResource,
    id: ObjectId,
    parent_id: Option<ObjectId>,
) -> Result<(), storage::Error<object::Error>> {
    // Moves are not implemented yet; change the stored parent directly for these fixtures.
    let key = tenant_subspace(&tenant.tenant_id).pack(&("object", id.as_bytes().as_slice()));
    let value = tx
        .get(&key, false)
        .await
        .map_err(FdbBindingError::from)?
        .ok_or(object::Error::NotFound)?;
    let mut attrs: StoredObject = unpack(&value).map_err(FdbBindingError::PackError)?;
    attrs.0 = parent_id.map(|id| id.as_bytes().to_vec());
    tx.set(&key, &pack(&attrs));
    Ok(())
}

async fn cleanup(tenant: &TenantResource) -> Result<()> {
    let tx = fdb::database()?.create_trx()?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}

fn bits(modes: Vec<Option<(ObjectResource, Mode)>>) -> Vec<Option<u32>> {
    modes
        .into_iter()
        .map(|entry| entry.map(|(_, mode)| mode.bits()))
        .collect()
}

async fn grants_were_read(tx: &Transaction, tenant: &TenantResource, id: ObjectId) -> Result<bool> {
    // Inspect FDB's recorded read conflicts to distinguish cache hits from grant range reads.
    let prefix = b"\xff\xff/transaction/read_conflict_range/";
    let (begin, end) = tenant_subspace(&tenant.tenant_id)
        .subspace(&("object-grant", id.as_bytes().as_slice()))
        .range();
    let range = RangeOption {
        limit: Some(1),
        ..RangeOption::from((
            [prefix.as_slice(), begin.as_slice()].concat(),
            [prefix.as_slice(), end.as_slice()].concat(),
        ))
    };
    Ok(!tx.get_range(&range, 1, true).await?.is_empty())
}

pub(crate) async fn grant_cache_skips_matching_versions_and_preserves_session_snapshots()
-> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut reader, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    reader.tree_hints = Arc::new(TreeHints::new(32));
    let (mut writer, _) = SessionResource::new(&tenant, vec!["writer".to_owned()])?;
    writer.tree_hints = Arc::clone(&reader.tree_hints);
    let root = ObjectResource::new_root(&tenant)?;
    let leaf = child(&tenant, root.object_id)?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 4), allow("writer", 2)])
        .await?;
    leaf.create(&tx, &[]).await?;
    tx.commit().await?;

    let old = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&old, &reader, &[leaf.object_id]).await?),
        [Some(4)]
    );
    assert!(grants_were_read(&old, &tenant, root.object_id).await?);
    assert!(grants_were_read(&old, &tenant, leaf.object_id).await?);

    // The same complete grants, including empty sets, serve another session without grant reads.
    let warm = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&warm, &writer, &[leaf.object_id]).await?),
        [Some(2)]
    );
    assert!(!grants_were_read(&warm, &tenant, root.object_id).await?);
    assert!(!grants_were_read(&warm, &tenant, leaf.object_id).await?);

    let update = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&update, &tenant, &root.object_id)
        .await?
        .context("missing root")?;
    root.update_grants(
        &update,
        &[GrantUpdate {
            grant: allow("reader", 4),
            remove: true,
        }],
    )?;
    update.commit().await?;

    // Only the root's grants changed; the leaf's cached empty set remains valid.
    let fresh = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&fresh, &reader, &[leaf.object_id]).await?),
        [Some(0)]
    );
    assert!(grants_were_read(&fresh, &tenant, root.object_id).await?);
    assert!(!grants_were_read(&fresh, &tenant, leaf.object_id).await?);

    // A newer cached version must not leak into an older transaction's snapshot.
    assert_eq!(
        bits(ObjectResource::modes_for_session(&old, &reader, &[leaf.object_id]).await?),
        [Some(4)]
    );
    // The older observation can replace the cache entry, so equality must be checked both ways.
    let latest = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&latest, &reader, &[leaf.object_id]).await?),
        [Some(0)]
    );
    assert!(grants_were_read(&latest, &tenant, root.object_id).await?);
    let warm = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&warm, &writer, &[leaf.object_id]).await?),
        [Some(2)]
    );
    assert!(!grants_were_read(&warm, &tenant, root.object_id).await?);
    cleanup(&tenant).await
}

pub(crate) async fn modes_for_session_evaluate_full_paths_and_all_grants() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    session.tree_hints = Arc::new(TreeHints::new(32));
    let root = ObjectResource::new_root(&tenant)?;
    let branch = child(&tenant, root.object_id)?;
    let leaf = child(&tenant, branch.object_id)?;
    let closed = child(&tenant, root.object_id)?;
    let reopened = child(&tenant, closed.object_id)?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 6), allow("reader/other", 6)])
        .await?;
    branch.create(&tx, &[deny(6), allow("reader", 2)]).await?;
    leaf.create(&tx, &[allow("reader", 4)]).await?;
    closed.create(&tx, &[deny(6)]).await?;
    reopened.create(&tx, &[allow("reader", 4)]).await?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let missing = ObjectId::new_v7();
    let ids = [
        leaf.object_id,
        root.object_id,
        branch.object_id,
        closed.object_id,
        reopened.object_id,
        leaf.object_id,
        missing,
    ];
    for _ in 0..2 {
        let modes = ObjectResource::modes_for_session(&tx, &session, &ids).await?;
        for (id, entry) in ids.iter().zip(&modes) {
            if let Some((object, _)) = entry {
                assert_eq!(object.object_id, *id);
                assert_eq!(object.tenant.tenant_id, tenant.tenant_id);
                assert!(object.metadata.is_none());
            }
        }
        let (_, mode) = modes[2].as_ref().context("missing branch mode")?;
        assert!(!mode.can_read());
        assert!(mode.can_write());
        assert_eq!(
            bits(modes),
            [Some(6), Some(6), Some(2), Some(0), Some(4), Some(6), None]
        );
    }
    for subjects in [vec![], vec!["Reader".to_owned()], vec!["read".to_owned()]] {
        let (mut other, _) = SessionResource::new(&tenant, subjects)?;
        other.tree_hints = Arc::clone(&session.tree_hints);
        assert_eq!(
            bits(ObjectResource::modes_for_session(&tx, &other, &[leaf.object_id]).await?),
            [Some(0)]
        );
    }
    // Total attachments can exceed one ListGrants page after multiple updates.
    let mut root = ObjectResource::fetch(&tx, &tenant, &root.object_id)
        .await?
        .context("missing root")?;
    for start in [0, 400] {
        let changes: Vec<_> = (start..start + 400)
            .map(|i| GrantUpdate {
                grant: allow(&format!("a/{i:04}"), 4),
                remove: false,
            })
            .collect();
        root.update_grants(&tx, &changes)?;
    }
    root.update_grants(
        &tx,
        &[GrantUpdate {
            grant: allow("z-reader", 6),
            remove: false,
        }],
    )?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let (mut last, _) = SessionResource::new(&tenant, vec!["z-reader".to_owned()])?;
    last.tree_hints = Arc::clone(&session.tree_hints);
    assert_eq!(
        bits(
            ObjectResource::modes_for_session(&tx, &last, &[leaf.object_id, root.object_id])
                .await?
        ),
        [Some(0), Some(6)]
    );
    assert!(
        ObjectResource::modes_for_session(&tx, &session, &[])
            .await?
            .is_empty()
    );
    assert!(matches!(
        ObjectResource::modes_for_session(&tx, &session, &[ObjectId::default()]).await,
        Err(storage::Error::Resource(object::Error::InvalidId))
    ));
    cleanup(&tenant).await
}

pub(crate) async fn tree_hints_follow_moves_and_recheck_grants() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    session.tree_hints = Arc::new(TreeHints::new(32));
    let root = ObjectResource::new_root(&tenant)?;
    let branch = child(&tenant, root.object_id)?;
    let closed = child(&tenant, root.object_id)?;
    let leaf = child(&tenant, branch.object_id)?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 4)]).await?;
    branch.create(&tx, &[allow("reader", 2)]).await?;
    closed.create(&tx, &[deny(6)]).await?;
    leaf.create(&tx, &[]).await?;
    tx.commit().await?;

    let old = fdb::database()?.create_trx()?;
    ObjectResource::fetch(&old, &tenant, &leaf.object_id)
        .await?
        .context("missing leaf")?;
    let old_version = old.get_read_version().await?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&old, &session, &[leaf.object_id]).await?),
        [Some(6)]
    );
    let tx = fdb::database()?.create_trx()?;
    set_parent(&tx, &tenant, branch.object_id, Some(closed.object_id)).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let modes =
        ObjectResource::modes_for_session(&tx, &session, &[leaf.object_id, branch.object_id])
            .await?;
    let (moved, _) = modes[1].as_ref().context("missing moved branch")?;
    assert_eq!(moved.parent_id, Some(closed.object_id));
    assert_eq!(bits(modes), [Some(2), Some(2)]);
    // Even after newer hints arrive, an existing transaction keeps its own read version.
    let modes =
        ObjectResource::modes_for_session(&old, &session, &[leaf.object_id, branch.object_id])
            .await?;
    let (original, _) = modes[1].as_ref().context("missing original branch")?;
    assert_eq!(original.parent_id, Some(root.object_id));
    assert_eq!(bits(modes), [Some(6), Some(6)]);
    assert_eq!(old.get_read_version().await?, old_version);

    let tx = fdb::database()?.create_trx()?;
    let mut branch = ObjectResource::fetch(&tx, &tenant, &branch.object_id)
        .await?
        .context("missing branch")?;
    branch.update_grants(
        &tx,
        &[GrantUpdate {
            grant: allow("reader", 2),
            remove: true,
        }],
    )?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &session, &[leaf.object_id]).await?),
        [Some(0)]
    );
    let mut closed = ObjectResource::fetch(&tx, &tenant, &closed.object_id)
        .await?
        .context("missing closed")?;
    closed.update_grants(
        &tx,
        &[GrantUpdate {
            grant: allow("reader", 4),
            remove: false,
        }],
    )?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &session, &[leaf.object_id]).await?),
        [Some(4)]
    );

    let mut leaf = ObjectResource::fetch(&tx, &tenant, &leaf.object_id)
        .await?
        .context("missing leaf")?;
    leaf.update_grants(
        &tx,
        &[GrantUpdate {
            grant: deny(4),
            remove: false,
        }],
    )?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &session, &[leaf.object_id]).await?),
        [Some(0)]
    );

    // A stale hint can point to a now-corrupt record which is no longer on the actual ancestry.
    set_parent(&tx, &tenant, leaf.object_id, Some(root.object_id)).await?;
    let mut leaf = ObjectResource::fetch(&tx, &tenant, &leaf.object_id)
        .await?
        .context("missing moved leaf")?;
    tx.set(
        &tenant_subspace(&tenant.tenant_id)
            .pack(&("object", branch.object_id.as_bytes().as_slice())),
        &[0xff],
    );
    leaf.update_grants(
        &tx,
        &[GrantUpdate {
            grant: deny(4),
            remove: true,
        }],
    )?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &session, &[leaf.object_id]).await?),
        [Some(4)]
    );
    tx.clear(
        &tenant_subspace(&tenant.tenant_id).pack(&("object", leaf.object_id.as_bytes().as_slice())),
    );
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &session, &[leaf.object_id]).await?),
        [None]
    );
    cleanup(&tenant).await
}

pub(crate) async fn ancestry_reads_follow_stale_hints_without_reading_grants() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    session.tree_hints = Arc::new(TreeHints::new(32));
    let hints = &session.tree_hints;
    let root = ObjectResource::new_root(&tenant)?;
    let branch = child(&tenant, root.object_id)?;
    let destination = child(&tenant, root.object_id)?;
    let leaf = child(&tenant, branch.object_id)?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 6)]).await?;
    branch.create(&tx, &[]).await?;
    destination.create(&tx, &[deny(4)]).await?;
    leaf.create(&tx, &[]).await?;
    tx.commit().await?;

    let old = fdb::database()?.create_trx()?;
    let objects = hints
        .fetch_ancestry(
            &old,
            &tenant,
            &[leaf.object_id, leaf.object_id, ObjectId::new_v7()],
        )
        .await?;
    assert_eq!(objects.len(), 3);
    for id in [root.object_id, branch.object_id, leaf.object_id] {
        assert!(
            objects
                .get(&id)
                .context("missing ancestor")?
                .metadata
                .is_none()
        );
        assert!(!grants_were_read(&old, &tenant, id).await?);
    }
    let old_version = old.get_read_version().await?;
    // An ancestry read does not populate the grant cache.
    assert_eq!(
        bits(ObjectResource::modes_for_session(&old, &session, &[leaf.object_id]).await?),
        [Some(6)]
    );
    assert!(grants_were_read(&old, &tenant, root.object_id).await?);

    let warm = fdb::database()?.create_trx()?;
    hints
        .fetch_ancestry(&warm, &tenant, &[leaf.object_id])
        .await?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&warm, &session, &[leaf.object_id]).await?),
        [Some(6)]
    );
    for id in [root.object_id, branch.object_id, leaf.object_id] {
        assert!(!grants_were_read(&warm, &tenant, id).await?);
    }

    let moved = fdb::database()?.create_trx()?;
    set_parent(&moved, &tenant, leaf.object_id, Some(destination.object_id)).await?;
    // The stale hinted parent is now irrelevant, even if its record cannot be decoded.
    moved.set(
        &tenant_subspace(&tenant.tenant_id)
            .pack(&("object", branch.object_id.as_bytes().as_slice())),
        &[0xff],
    );
    moved.commit().await?;
    let fresh = fdb::database()?.create_trx()?;
    let objects = hints
        .fetch_ancestry(&fresh, &tenant, &[leaf.object_id])
        .await?;
    assert_eq!(objects.len(), 3);
    assert_eq!(
        objects
            .get(&leaf.object_id)
            .context("missing moved leaf")?
            .parent_id,
        Some(destination.object_id)
    );
    assert!(objects.contains_key(&destination.object_id));
    assert!(!objects.contains_key(&branch.object_id));
    for id in [root.object_id, destination.object_id, leaf.object_id] {
        assert!(!grants_were_read(&fresh, &tenant, id).await?);
    }
    assert_eq!(
        bits(ObjectResource::modes_for_session(&fresh, &session, &[leaf.object_id]).await?),
        [Some(2)]
    );

    // Hints learned at a newer version must not change the older transaction's ancestry.
    let objects = hints
        .fetch_ancestry(&old, &tenant, &[leaf.object_id])
        .await?;
    assert_eq!(
        objects
            .get(&leaf.object_id)
            .context("missing original leaf")?
            .parent_id,
        Some(branch.object_id)
    );
    assert!(objects.contains_key(&branch.object_id));
    assert!(!objects.contains_key(&destination.object_id));
    assert_eq!(old.get_read_version().await?, old_version);
    cleanup(&tenant).await
}

pub(crate) async fn ancestry_reads_validate_paths_and_conflict_with_reparenting() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let hints = TreeHints::new(32);
    let root = ObjectResource::new_root(&tenant)?;
    let a = child(&tenant, root.object_id)?;
    let b = child(&tenant, root.object_id)?;
    let leaf = child(&tenant, a.object_id)?;
    let setup = fdb::database()?.create_trx()?;
    for object in [&root, &a, &b, &leaf] {
        object.create(&setup, &[]).await?;
    }
    setup.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    assert!(hints.fetch_ancestry(&tx, &tenant, &[]).await?.is_empty());
    assert!(
        hints
            .fetch_ancestry(&tx, &tenant, &[ObjectId::new_v7()])
            .await?
            .is_empty()
    );
    assert!(matches!(
        hints
            .fetch_ancestry(&tx, &tenant, &[ObjectId::default()])
            .await,
        Err(storage::Error::Resource(object::Error::InvalidId))
    ));
    hints
        .fetch_ancestry(&tx, &tenant, &[leaf.object_id])
        .await?;
    let concurrent = fdb::database()?.create_trx()?;
    set_parent(&concurrent, &tenant, a.object_id, Some(b.object_id)).await?;
    concurrent.commit().await?;
    // A write ensures FDB checks this transaction's recorded ancestry reads at commit.
    tx.set(
        &tenant_subspace(&tenant.tenant_id).pack(&"conflict-test"),
        &[],
    );
    let error: FdbError = tx
        .commit()
        .await
        .err()
        .context("expected ancestry conflict")?
        .into();
    assert_eq!(error.code(), 1020);

    let tx = fdb::database()?.create_trx()?;
    assert!(
        hints
            .fetch_ancestry(&tx, &tenant, &[leaf.object_id])
            .await?
            .contains_key(&b.object_id)
    );
    for parent in [None, Some(ObjectId::new_v7()), Some(leaf.object_id)] {
        set_parent(&tx, &tenant, a.object_id, parent).await?;
        assert!(matches!(
            hints.fetch_ancestry(&tx, &tenant, &[leaf.object_id]).await,
            Err(storage::Error::Resource(object::Error::InvalidAncestry))
        ));
    }
    cleanup(&tenant).await
}

pub(crate) async fn modes_for_session_isolate_tenants_and_reject_invalid_ancestry() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut other, _) = TenantResource::new(format!("{}/other", tenant.tenant_id))?;
    other.root_id = tenant.root_id;
    let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let (other_session, _) = SessionResource::new(&other, vec!["reader".to_owned()])?;
    assert!(Arc::ptr_eq(&session.tree_hints, &other_session.tree_hints));
    let root = ObjectResource::new_root(&tenant)?;
    let other_root = ObjectResource::new_root(&other)?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 6)]).await?;
    other_root.create(&tx, &[]).await?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &session, &[root.object_id]).await?),
        [Some(6)]
    );
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &other_session, &[root.object_id]).await?),
        [Some(0)]
    );
    let foreign = child(&tenant, root.object_id)?;
    foreign.create(&tx, &[]).await?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        bits(ObjectResource::modes_for_session(&tx, &other_session, &[foreign.object_id]).await?),
        [None]
    );

    let a = child(&tenant, root.object_id)?;
    let b = child(&tenant, a.object_id)?;
    a.create(&tx, &[allow("reader", 6)]).await?;
    b.create(&tx, &[]).await?;
    tx.commit().await?;
    for parent in [Some(b.object_id), Some(ObjectId::new_v7()), None] {
        let tx = fdb::database()?.create_trx()?;
        set_parent(&tx, &tenant, a.object_id, parent).await?;
        tx.commit().await?;
        let tx = fdb::database()?.create_trx()?;
        assert!(matches!(
            ObjectResource::modes_for_session(&tx, &session, &[b.object_id]).await,
            Err(storage::Error::Resource(object::Error::InvalidAncestry))
        ));
    }
    let mut file = child(&tenant, root.object_id)?;
    file.kind = ObjectKind::File;
    let tx = fdb::database()?.create_trx()?;
    file.create(&tx, &[]).await?;
    set_parent(&tx, &tenant, a.object_id, Some(file.object_id)).await?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert!(matches!(
        ObjectResource::modes_for_session(&tx, &session, &[a.object_id]).await,
        Err(storage::Error::Resource(object::Error::InvalidAncestry))
    ));

    let bad_grant = tenant_subspace(&tenant.tenant_id).pack(&(
        "object-grant",
        root.object_id.as_bytes().as_slice(),
        "DENY",
        1_u32,
    ));
    tx.set(&bad_grant, &[]);
    // Advance the version with the corrupt grant so cached grants cannot conceal it.
    let mut root = ObjectResource::fetch(&tx, &tenant, &root.object_id)
        .await?
        .context("missing root")?;
    root.update_grants(&tx, &[])?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    assert!(matches!(
        ObjectResource::modes_for_session(&tx, &session, &[root.object_id]).await,
        Err(storage::Error::Resource(object::Error::InvalidStoredGrant))
    ));
    cleanup(&tenant).await?;
    cleanup(&other).await
}

pub(crate) async fn permission_reads_conflict_with_changes_and_retry() -> Result<()> {
    for change in ["revoke", "deny", "move"] {
        let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
        let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
        let root = ObjectResource::new_root(&tenant)?;
        let leaf = child(&tenant, root.object_id)?;
        let closed = child(&tenant, root.object_id)?;
        let tx = fdb::database()?.create_trx()?;
        root.create(&tx, &[allow("reader", 6)]).await?;
        leaf.create(&tx, &[]).await?;
        closed.create(&tx, &[deny(6)]).await?;
        tx.commit().await?;

        let database = fdb::database()?;
        let warm = database.create_trx()?;
        assert_eq!(
            bits(ObjectResource::modes_for_session(&warm, &session, &[leaf.object_id]).await?),
            [Some(6)]
        );
        let attempts = AtomicUsize::new(0);
        let staged_key = tenant_subspace(&tenant.tenant_id).pack(&"permission-test");
        let modes = fdb::with_transaction(|tx| {
            let attempt = attempts.fetch_add(1, Ordering::Relaxed);
            let session = &session;
            let tenant = &tenant;
            let root = &root;
            let leaf = &leaf;
            let closed = &closed;
            let staged_key = &staged_key;
            async move {
                let modes =
                    ObjectResource::modes_for_session(&tx, session, &[leaf.object_id]).await?;
                if attempt == 0 {
                    assert_eq!(bits(modes.clone()), [Some(6)]);
                    let concurrent = database.create_trx().map_err(FdbBindingError::from)?;
                    match change {
                        "revoke" => {
                            let mut root =
                                ObjectResource::fetch(&concurrent, tenant, &root.object_id)
                                    .await?
                                    .ok_or(object::Error::NotFound)?;
                            root.update_grants(
                                &concurrent,
                                &[GrantUpdate {
                                    grant: allow("reader", 6),
                                    remove: true,
                                }],
                            )?;
                        }
                        "deny" => {
                            let mut leaf =
                                ObjectResource::fetch(&concurrent, tenant, &leaf.object_id)
                                    .await?
                                    .ok_or(object::Error::NotFound)?;
                            leaf.update_grants(
                                &concurrent,
                                &[GrantUpdate {
                                    grant: deny(6),
                                    remove: false,
                                }],
                            )?;
                        }
                        "move" => {
                            set_parent(&concurrent, tenant, leaf.object_id, Some(closed.object_id))
                                .await?
                        }
                        _ => unreachable!(),
                    }
                    concurrent
                        .commit()
                        .await
                        .map_err(FdbError::from)
                        .map_err(FdbBindingError::from)?;
                }
                // A write makes commit validate the permission reads and retry the whole closure.
                tx.set(staged_key, b"committed");
                Ok::<_, storage::Error<object::Error>>(modes)
            }
        })
        .await?;
        assert!(
            attempts.load(Ordering::Relaxed) >= 2,
            "missing retry for {change}"
        );
        assert_eq!(bits(modes), [Some(0)], "stale permission after {change}");
        cleanup(&tenant).await?;
    }
    Ok(())
}
