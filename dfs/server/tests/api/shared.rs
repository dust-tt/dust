use anyhow::{Context, Result};
use dfs_api::storage::{fdb, resources::tenant::TenantResource};
use dfs_protocol::{
    NAME_MAX_BYTES, ObjectId, ObjectRef,
    rpc::{
        CreateSessionRequest, CreateTenantRequest, ErrorCode, GrantUpdate, ListRequest,
        LookupRequest, LookupTarget, ObjectKind, UpdateGrantsRequest, dfs_client::DfsClient,
    },
};

use super::{allow, attach, create_directory_child};
use crate::{MASTER_KEY, serve, with_authorization};

pub(crate) async fn shared_lists_aliases_and_lookup_rechecks_revocation() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let tenant = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants: vec![],
            },
            &format!("Bearer {MASTER_KEY}"),
        )?)
        .await?
        .into_inner();
    let tenant_authorization = format!("Bearer {}", tenant.tenant_key);
    let session = client
        .create_session(with_authorization(
            CreateSessionRequest {
                subjects: vec!["reader".into(), "group".into()],
            },
            &tenant_authorization,
        )?)
        .await?
        .into_inner();
    let authorization = format!("Bearer {}", session.session_key);

    let tx = fdb::database()?.create_trx()?;
    let resource = TenantResource::fetch(&tx, &tenant.tenant_id)
        .await?
        .context("missing tenant")?;
    let first_parent = create_directory_child(
        &tx,
        &resource,
        &tenant.root_id,
        "first",
        ObjectKind::Directory,
    )
    .await?;
    let second_parent = create_directory_child(
        &tx,
        &resource,
        &tenant.root_id,
        "second",
        ObjectKind::Directory,
    )
    .await?;
    let name = "x".repeat(NAME_MAX_BYTES);
    let first =
        create_directory_child(&tx, &resource, &first_parent, &name, ObjectKind::File).await?;
    let second =
        create_directory_child(&tx, &resource, &second_parent, &name, ObjectKind::File).await?;
    tx.commit().await?;
    for (id, grant) in [
        (first, allow("reader", 4)),
        (first, allow("group", 2)),
        (second, allow("group", 4)),
    ] {
        attach(&mut client, &tenant_authorization, id, grant).await?;
    }

    let mut entries = Vec::new();
    let mut after = None;
    let mut finished = false;
    for _ in 0..10 {
        let page = client
            .list(with_authorization(
                ListRequest {
                    directory_id: ObjectRef::Shared,
                    after: after.clone(),
                    limit: 1,
                },
                &authorization,
            )?)
            .await?
            .into_inner();
        assert!(page.entries.len() <= 1);
        entries.extend(page.entries);
        let Some(next) = page.next_after else {
            finished = true;
            break;
        };
        assert_ne!(after.as_ref(), Some(&next));
        after = Some(next);
    }
    assert!(finished);
    assert_eq!(entries.len(), 2);
    let mut expected = vec![first, second];
    expected.sort();
    for (entry, id) in entries.iter().zip(expected) {
        assert_eq!(entry.name, format!("{name}--{id}"));
        let attr = entry.object.as_ref().context("missing listed attributes")?;
        assert_eq!(attr.id, id.into());
        assert_eq!(attr.name, name);
        assert_eq!(attr.mode, if id == first { 0o600 } else { 0o400 });
        assert!(attr.metadata.is_none());
    }
    let mut targets: Vec<_> = entries
        .iter()
        .map(|entry| LookupTarget {
            parent_id: ObjectRef::Shared,
            name: entry.name.clone(),
        })
        .collect();
    targets.push(LookupTarget {
        parent_id: first_parent.into(),
        name: name.clone(),
    });
    let results = client
        .lookup(with_authorization(
            LookupRequest {
                targets,
                include_metadata: Some(true),
            },
            &authorization,
        )?)
        .await?
        .into_inner()
        .results;
    for (result, entry) in results.iter().zip(&entries) {
        assert!(result.error.is_none());
        let attr = result
            .object
            .as_ref()
            .context("missing lookup attributes")?;
        assert_eq!(Some(attr.id), entry.object.as_ref().map(|attr| attr.id));
        assert_eq!(attr.name, name);
        assert!(attr.metadata.is_some());
    }
    assert_eq!(
        results[2]
            .error
            .as_ref()
            .context("expected hidden parent")?
            .code(),
        ErrorCode::NotFound
    );
    assert_eq!(
        results[0].object.as_ref().map(|attr| attr.store_version),
        results[1].object.as_ref().map(|attr| attr.store_version)
    );

    client
        .update_grants(with_authorization(
            UpdateGrantsRequest {
                object_id: first,
                changes: vec![
                    GrantUpdate {
                        grant: allow("reader", 4),
                        remove: true,
                    },
                    GrantUpdate {
                        grant: allow("group", 2),
                        remove: true,
                    },
                ],
            },
            &tenant_authorization,
        )?)
        .await?;
    let result = client
        .lookup(with_authorization(
            LookupRequest {
                targets: vec![LookupTarget {
                    parent_id: ObjectRef::Shared,
                    name: format!("{name}--{first}"),
                }],
                include_metadata: None,
            },
            &authorization,
        )?)
        .await?
        .into_inner()
        .results
        .remove(0);
    assert!(result.object.is_none());
    assert_eq!(
        result.error.context("expected revoked entry")?.code(),
        ErrorCode::NotFound
    );
    let page = client
        .list(with_authorization(
            ListRequest {
                directory_id: ObjectRef::Shared,
                after: None,
                limit: 4096,
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(page.entries.len(), 1);
    assert_eq!(
        page.entries[0].object.as_ref().map(|attr| attr.id),
        Some(second.into())
    );
    assert!(page.next_after.is_none());
    Ok(())
}
