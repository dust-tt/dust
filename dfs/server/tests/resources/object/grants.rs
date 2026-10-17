use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        keys::tenant_subspace,
        object::{self, ObjectResource},
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{AllowGrant, DenyGrant, Grant, GrantUpdate, grant},
};
use foundationdb::{
    RangeOption, Transaction,
    tuple::{pack, unpack},
};

use super::StoredObject;

pub(crate) fn allow(subject: &str, mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: subject.to_owned(),
            mode,
        })),
    }
}

pub(crate) fn deny(mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode })),
    }
}

pub(super) async fn records(tx: &Transaction, tenant_id: &str) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
    let mut range = Some(RangeOption::from(tenant_subspace(tenant_id).range()));
    let mut entries = Vec::new();
    let mut iteration = 1;
    while let Some(current) = range {
        let batch = tx.get_range(&current, iteration, false).await?;
        range = current.next_range(&batch);
        entries.extend(
            batch
                .iter()
                .map(|entry| (entry.key().to_vec(), entry.value().to_vec())),
        );
        iteration += 1;
    }
    Ok(entries)
}

pub(crate) async fn grant_listing_and_updates_preserve_indexes_and_attributes() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let root = ObjectResource::new_root(&tenant)?;
    let expected = vec![
        allow("a", 2),
        allow("a", 4),
        allow("a\0", 2),
        allow("z", 0),
        allow("é", 6),
        deny(2),
        deny(6),
    ];
    let mut initial = expected.clone();
    initial.reverse();
    initial.push(allow("a", 2));
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &initial).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&tx, &tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    assert!(root.metadata.is_none());
    let before = records(&tx, &tenant.tenant_id).await?;
    let mut grants = Vec::new();
    let mut after = None;
    let mut first_cursor = None;
    loop {
        let page = root.list_grants(&tx, after.as_deref(), 2).await?;
        assert!(page.grants.len() <= 2);
        if first_cursor.is_none() {
            first_cursor = page.next_after.clone();
        }
        grants.extend(page.grants);
        after = page.next_after;
        if after.is_none() {
            break;
        }
    }
    assert_eq!(grants, expected);
    assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    assert_eq!(root.grants_version, 1);
    let cursor = first_cursor.context("missing cursor")?;
    let (mut other, _) = TenantResource::new(format!("{}/other", tenant.tenant_id))?;
    other.root_id = tenant.root_id;
    let other_root = ObjectResource::new_root(&other)?;
    other_root.create(&tx, &[]).await?;
    assert!(matches!(
        other_root.list_grants(&tx, Some(&cursor), 2).await,
        Err(storage::Error::Resource(object::Error::InvalidGrantCursor))
    ));
    assert!(
        other_root
            .list_grants(&tx, None, 2)
            .await?
            .grants
            .is_empty()
    );

    let mut child = ObjectResource::new_root(&tenant)?;
    child.object_id = ObjectId::new_v7();
    child.parent_id = Some(root.object_id);
    child.name = "child".to_owned();
    child.create(&tx, &[]).await?;
    assert!(child.list_grants(&tx, None, 2).await?.grants.is_empty());
    assert!(matches!(
        child.list_grants(&tx, Some(&cursor), 2).await,
        Err(storage::Error::Resource(object::Error::InvalidGrantCursor))
    ));

    let before = records(&tx, &tenant.tenant_id).await?;
    root.update_grants(
        &tx,
        &[
            GrantUpdate {
                grant: allow("a", 2),
                remove: true,
            },
            GrantUpdate {
                grant: allow("a", 4),
                remove: true,
            },
            GrantUpdate {
                grant: allow("new", 6),
                remove: false,
            },
            GrantUpdate {
                grant: deny(0),
                remove: true,
            },
            GrantUpdate {
                grant: deny(6),
                remove: false,
            },
        ],
    )?;
    assert_eq!(root.grants_version, 2);
    let expected = vec![
        allow("a\0", 2),
        allow("new", 6),
        allow("z", 0),
        allow("é", 6),
        deny(2),
        deny(6),
    ];
    assert_eq!(root.list_grants(&tx, None, 512).await?.grants, expected);
    // The exclusive cursor still works after its own grant was detached.
    assert_eq!(
        root.list_grants(&tx, Some(&cursor), 512).await?.grants,
        expected
    );
    let subspace = tenant_subspace(&tenant.tenant_id);
    let object_key = subspace.pack(&("object", root.object_id.as_bytes().as_slice()));
    for (key, mut value) in before {
        if key == object_key {
            let mut attributes: StoredObject = unpack(&value)?;
            attributes.9 = 2;
            value = pack(&attributes);
        }
        let forward = subspace.subspace(&("object-grant", root.object_id.as_bytes().as_slice()));
        let reverse = subspace.subspace(&"grant-object");
        if !forward.is_start_of(&key) && !reverse.is_start_of(&key) {
            assert_eq!(
                tx.get(&key, false).await?.as_deref(),
                Some(value.as_slice())
            );
        }
    }
    let reverse = subspace.subspace(&"grant-object");
    let entries = tx
        .get_range(&RangeOption::from(reverse.range()), 1, false)
        .await?;
    assert_eq!(entries.len(), 4);
    for grant in expected {
        if let Some(grant::Kind::Allow(allow)) = grant.kind {
            let key = reverse.pack(&(
                "ALLOW",
                allow.subject.as_str(),
                root.object_id.as_bytes().as_slice(),
                allow.mode,
            ));
            assert_eq!(tx.get(&key, false).await?.as_deref(), Some([].as_slice()));
        }
    }
    for tenant_id in [&tenant.tenant_id, &other.tenant_id] {
        let (begin, end) = tenant_subspace(tenant_id).range();
        tx.clear_range(&begin, &end);
    }
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn grant_creation_and_update_validation_preserve_state() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let mut root = ObjectResource::new_root(&tenant)?;
    let invalid = vec![
        Grant::default(),
        allow("", 4),
        allow(&"é".repeat(513), 4),
        allow("a", 1),
        deny(8),
    ];
    for grant in &invalid {
        let tx = fdb::database()?.create_trx()?;
        assert!(matches!(
            root.create(&tx, &[allow("valid", 4), grant.clone()]).await,
            Err(storage::Error::Resource(object::Error::InvalidGrant))
        ));
        assert!(records(&tx, &tenant.tenant_id).await?.is_empty());
    }
    let too_many: Vec<_> = (0..513).map(|i| allow(&i.to_string(), 4)).collect();
    let tx = fdb::database()?.create_trx()?;
    assert!(matches!(
        root.create(&tx, &too_many).await,
        Err(storage::Error::Resource(object::Error::TooManyGrants))
    ));
    assert!(records(&tx, &tenant.tenant_id).await?.is_empty());
    // Initial grants count distinct complete values rather than input elements.
    root.create(&tx, &vec![allow("existing", 6); 513]).await?;
    let before = records(&tx, &tenant.tenant_id).await?;
    for grant in invalid {
        assert!(matches!(
            root.update_grants(
                &tx,
                &[
                    GrantUpdate {
                        grant: allow("valid", 4),
                        remove: false
                    },
                    GrantUpdate {
                        grant,
                        remove: false
                    },
                ]
            ),
            Err(storage::Error::Resource(object::Error::InvalidGrant))
        ));
        assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    }
    assert!(matches!(
        root.update_grants(
            &tx,
            &[
                GrantUpdate {
                    grant: allow("existing", 6),
                    remove: true
                },
                GrantUpdate {
                    grant: allow("existing", 6),
                    remove: false
                },
            ]
        ),
        Err(storage::Error::Resource(object::Error::DuplicateGrant))
    ));
    let changes: Vec<_> = too_many
        .into_iter()
        .map(|grant| GrantUpdate {
            grant,
            remove: false,
        })
        .collect();
    assert!(matches!(
        root.update_grants(&tx, &changes),
        Err(storage::Error::Resource(object::Error::TooManyGrants))
    ));
    assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    for limit in [0, 513] {
        assert!(matches!(
            root.list_grants(&tx, None, limit).await,
            Err(storage::Error::Resource(object::Error::InvalidGrantLimit))
        ));
    }
    for cursor in ["", "not a cursor"] {
        assert!(matches!(
            root.list_grants(&tx, Some(cursor), 1).await,
            Err(storage::Error::Resource(object::Error::InvalidGrantCursor))
        ));
    }
    Ok(())
}

pub(crate) async fn grant_versions_advance_for_no_ops() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let mut root = ObjectResource::new_root(&tenant)?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("existing", 6)]).await?;
    let object_key =
        tenant_subspace(&tenant.tenant_id).pack(&("object", root.object_id.as_bytes().as_slice()));
    let mut expected = records(&tx, &tenant.tenant_id).await?;
    for (version, changes) in [
        (2, vec![]),
        (
            3,
            vec![GrantUpdate {
                grant: allow("existing", 6),
                remove: false,
            }],
        ),
        (
            4,
            vec![GrantUpdate {
                grant: deny(4),
                remove: true,
            }],
        ),
    ] {
        root.update_grants(&tx, &changes)?;
        assert_eq!(root.grants_version, version);
        let (_, value) = expected
            .iter_mut()
            .find(|(key, _)| key == &object_key)
            .context("missing root attributes")?;
        let mut attributes: StoredObject = unpack(value)?;
        attributes.9 = version;
        *value = pack(&attributes);
        assert_eq!(records(&tx, &tenant.tenant_id).await?, expected);
    }

    Ok(())
}

pub(crate) async fn grant_pagination_handles_full_pages_and_object_deletion() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let root = ObjectResource::new_root(&tenant)?;
    let grants: Vec<_> = (0..512)
        .map(|i| allow(&format!("{i:04}{}", "é".repeat(510)), 4))
        .collect();
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &grants).await?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&tx, &tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    let page = root.list_grants(&tx, None, 512).await?;
    assert_eq!(page.grants, grants);
    assert_eq!(page.next_after, None);
    root.update_grants(
        &tx,
        &[GrantUpdate {
            grant: deny(6),
            remove: false,
        }],
    )?;
    let page = root.list_grants(&tx, None, 512).await?;
    assert_eq!(page.grants, grants);
    let cursor = page.next_after.context("missing next page")?;
    let page = root.list_grants(&tx, Some(&cursor), 512).await?;
    assert_eq!(page.grants, vec![deny(6)]);
    assert_eq!(page.next_after, None);

    // An object deleted after the fetch cannot gain orphan grants from this transaction.
    let deletion = fdb::database()?.create_trx()?;
    let subspace = tenant_subspace(&tenant.tenant_id);
    deletion.clear(&subspace.pack(&("object", tenant.root_id.as_bytes().as_slice())));
    deletion.commit().await?;
    let error = tx
        .commit()
        .await
        .err()
        .context("expected deletion conflict")?;
    assert_eq!(error.code(), 1020);
    let tx = fdb::database()?.create_trx()?;
    assert!(
        ObjectResource::fetch(&tx, &tenant, &tenant.root_id)
            .await?
            .is_none()
    );
    assert!(matches!(
        ObjectResource::fetch(&tx, &tenant, &ObjectId::default()).await,
        Err(storage::Error::Resource(object::Error::InvalidId))
    ));
    assert!(
        tx.get(
            &subspace.pack(&(
                "object-grant",
                tenant.root_id.as_bytes().as_slice(),
                "DENY",
                6u32
            )),
            false
        )
        .await?
        .is_none()
    );
    let (begin, end) = subspace.range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}
