use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        fdb,
        resources::{
            keys::{namespace_subspace, tenant_subspace},
            object::ObjectResource,
            session::SessionResource,
            tenant::TenantResource,
        },
    },
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{
        AllowGrant, CreateSessionRequest, CreateTenantRequest, DenyGrant, ErrorCode, Grant,
        GrantUpdate, ObjectKind, StatRequest, UpdateGrantsRequest, dfs_client::DfsClient, grant,
    },
};

use crate::{MASTER_KEY, error_code, serve, with_authorization};

pub(crate) async fn stat_returns_authorized_attributes_and_rechecks_grants() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let root_grant = Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: "reader".to_owned(),
            mode: 0o6,
        })),
    };
    let tenant = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants: vec![root_grant],
            },
            &format!("Bearer {MASTER_KEY}"),
        )?)
        .await?
        .into_inner();
    let tenant_authorization = format!("Bearer {}", tenant.tenant_key);
    let session = client
        .create_session(with_authorization(
            CreateSessionRequest {
                subjects: vec!["reader".to_owned()],
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
    // File and directory creation RPCs are not implemented yet.
    let mut file = ObjectResource::new_root(&resource)?;
    file.object_id = ObjectId::new_v7();
    file.parent_id = Some(tenant.root_id);
    file.name = "report.txt".to_owned();
    file.kind = ObjectKind::File;
    file.size = 123;
    file.atime_ms = Some(0);
    file.mtime_ms = None;
    file.ctime_ms = Some(7);
    file.attr_version = 4;
    file.content_version = 3;
    file.create(&tx, &[]).await?;
    let mut write_only = ObjectResource::new_root(&resource)?;
    write_only.object_id = ObjectId::new_v7();
    write_only.parent_id = Some(tenant.root_id);
    write_only.name = "write-only".to_owned();
    let deny_read = Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode: 0o4 })),
    };
    write_only
        .create(&tx, std::slice::from_ref(&deny_read))
        .await?;
    let (other, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    ObjectResource::new_root(&other)?.create(&tx, &[]).await?;
    // Stat without metadata must not decode the metadata record.
    tx.set(
        &tenant_subspace(&tenant.tenant_id)
            .pack(&("metadata", file.object_id.as_bytes().as_slice())),
        &[0xff],
    );
    tx.commit().await?;

    let request = StatRequest {
        object_ids: vec![
            file.object_id.into(),
            ObjectRef::Root,
            ObjectId::new_v7().into(),
            write_only.object_id.into(),
            tenant.root_id.into(),
            ObjectRef::Shared,
            file.object_id.into(),
            other.root_id.into(),
        ],
        include_metadata: None,
    };
    let results = client
        .stat(with_authorization(request, &authorization)?)
        .await?
        .into_inner()
        .results;
    assert_eq!(results.len(), 8);
    for (index, expected) in [
        (2, ErrorCode::NotFound),
        (3, ErrorCode::NotFound),
        (7, ErrorCode::NotFound),
    ] {
        assert!(results[index].object.is_none());
        assert_eq!(
            results[index]
                .error
                .as_ref()
                .context("missing result error")?
                .code(),
            expected
        );
    }
    for index in [0, 1, 4, 5, 6] {
        assert!(results[index].error.is_none());
    }
    let attributes = results[0]
        .object
        .as_ref()
        .context("missing file attributes")?;
    assert_eq!(attributes.id, ObjectRef::Object(file.object_id));
    assert_eq!(attributes.name, "report.txt");
    assert_eq!(attributes.kind(), ObjectKind::File);
    assert_eq!(attributes.size, 123);
    assert_eq!(attributes.mode, 0o600);
    assert_eq!(
        (attributes.atime, attributes.mtime, attributes.ctime),
        (Some(0), None, Some(7))
    );
    assert_eq!(
        (attributes.attr_version, attributes.content_version),
        (4, 3)
    );
    assert!(attributes.metadata.is_none());
    assert!(attributes.view.store_version > 0);
    assert_eq!(attributes.view.store_version, attributes.view.auth_version);
    assert_eq!(results[0], results[6]);
    let root = results[4]
        .object
        .as_ref()
        .context("missing root attributes")?;
    assert_eq!(root.id, ObjectRef::Object(tenant.root_id));
    assert_eq!(root.name, "");
    assert_eq!(root.kind(), ObjectKind::Directory);
    assert_eq!(root.size, 0);
    assert_eq!(root.mode, 0o700);
    assert_eq!(root.view, attributes.view);
    assert!(root.metadata.is_none());
    let projected = results[1].object.as_ref().context("missing virtual root")?;
    let mut expected_root = root.clone();
    expected_root.id = ObjectRef::Root;
    assert_eq!(projected, &expected_root);
    let shared = results[5].object.as_ref().context("missing shared")?;
    assert_eq!(shared.id, ObjectRef::Shared);
    assert_eq!(shared.name, "shared");
    assert_eq!(shared.kind(), ObjectKind::Directory);
    assert_eq!(shared.mode, 0o500);
    assert_eq!(shared.size, 0);
    assert_eq!(
        (shared.atime, shared.mtime, shared.ctime),
        (None, None, None)
    );
    assert_eq!((shared.attr_version, shared.content_version), (1, 1));
    assert_eq!(shared.view, root.view);
    assert!(shared.metadata.is_none());

    let empty_session = client
        .create_session(with_authorization(
            CreateSessionRequest { subjects: vec![] },
            &tenant_authorization,
        )?)
        .await?
        .into_inner();
    let projected = client
        .stat(with_authorization(
            StatRequest {
                object_ids: vec![
                    ObjectRef::Shared,
                    tenant.root_id.into(),
                    ObjectRef::Root,
                    ObjectRef::Shared,
                ],
                include_metadata: None,
            },
            &format!("Bearer {}", empty_session.session_key),
        )?)
        .await?
        .into_inner()
        .results;
    assert_eq!(projected.len(), 4);
    assert!(projected[1].object.is_none());
    assert_eq!(
        projected[1]
            .error
            .as_ref()
            .context("missing root denial")?
            .code(),
        ErrorCode::NotFound
    );
    for (index, reference) in [
        (0, ObjectRef::Shared),
        (2, ObjectRef::Root),
        (3, ObjectRef::Shared),
    ] {
        assert!(projected[index].error.is_none());
        let attr = projected[index]
            .object
            .as_ref()
            .context("missing virtual directory")?;
        assert_eq!(attr.id, reference);
        assert_eq!(attr.mode, 0o500);
    }
    assert_eq!(projected[0], projected[3]);

    let request = StatRequest {
        object_ids: vec![file.object_id.into()],
        include_metadata: Some(false),
    };
    // Reuse the same session and warm hints while changing the target's grants.
    for (grant, expected_mode) in [
        (deny_read, None),
        (
            Grant {
                kind: Some(grant::Kind::Allow(AllowGrant {
                    subject: "reader".to_owned(),
                    mode: 0o4,
                })),
            },
            Some(0o600),
        ),
        (
            Grant {
                kind: Some(grant::Kind::Deny(DenyGrant { mode: 0o2 })),
            },
            Some(0o400),
        ),
    ] {
        client
            .update_grants(with_authorization(
                UpdateGrantsRequest {
                    object_id: file.object_id,
                    changes: vec![GrantUpdate {
                        grant,
                        remove: false,
                    }],
                },
                &tenant_authorization,
            )?)
            .await?;
        let response = client
            .stat(with_authorization(request.clone(), &authorization)?)
            .await?
            .into_inner();
        let result = &response.results[0];
        if let Some(mode) = expected_mode {
            let object = result.object.as_ref().context("missing reopened file")?;
            assert!(result.error.is_none());
            assert_eq!(object.mode, mode);
            assert_eq!((object.attr_version, object.content_version), (4, 3));
        } else {
            assert!(result.object.is_none());
            assert_eq!(
                result.error.as_ref().context("missing denial")?.code(),
                ErrorCode::NotFound
            );
        }
    }

    for (object_ids, include_metadata, expected) in [
        (vec![], None, ErrorCode::InvalidInput),
        (
            vec![tenant.root_id.into(); 257],
            None,
            ErrorCode::InvalidInput,
        ),
        (vec![ObjectRef::Invalid], None, ErrorCode::InvalidInput),
        (
            vec![file.object_id.into()],
            Some(true),
            ErrorCode::Unsupported,
        ),
    ] {
        let error = client
            .stat(with_authorization(
                StatRequest {
                    object_ids,
                    include_metadata,
                },
                &authorization,
            )?)
            .await
            .err()
            .context("expected invalid or unsupported Stat to fail")?;
        assert_eq!(error_code(&error)?, expected);
    }
    let response = client
        .stat(with_authorization(
            StatRequest {
                object_ids: vec![tenant.root_id.into(); 256],
                include_metadata: Some(false),
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(response.results.len(), 256);
    for result in &response.results {
        assert_eq!(result, &response.results[0]);
        assert_eq!(
            result.object.as_ref().context("missing repeated root")?.id,
            ObjectRef::Object(tenant.root_id)
        );
        assert!(result.error.is_none());
    }
    let error = client
        .stat(with_authorization(request, &tenant_authorization)?)
        .await
        .err()
        .context("tenant key must not authorize Stat")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);

    let tx = fdb::database()?.create_trx()?;
    SessionResource::revoke(&tx, &resource, &session.id).await?;
    SessionResource::revoke(&tx, &resource, &empty_session.id).await?;
    for id in [&tenant.tenant_id, &other.tenant_id] {
        let (begin, end) = tenant_subspace(id).range();
        tx.clear_range(&begin, &end);
    }
    tx.clear(&namespace_subspace().pack(&("tenant-key", hash_key(&tenant.tenant_key).as_slice())));
    tx.commit().await?;
    Ok(())
}
