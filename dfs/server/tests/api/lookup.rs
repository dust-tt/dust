use std::collections::HashMap;

use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{directory::DirectoryResource, object::ObjectResource, tenant::TenantResource},
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{
        AllowGrant, AttrResult, CreateSessionRequest, CreateTenantRequest, DenyGrant, ErrorCode,
        Grant, GrantUpdate, LookupRequest, LookupTarget, ObjectKind, UpdateGrantsRequest,
        dfs_client::DfsClient, grant,
    },
};
use foundationdb::Transaction;
use tonic::transport::Channel;

use crate::{MASTER_KEY, error_code, serve, with_authorization};

fn target(parent_id: impl Into<ObjectRef>, name: &str) -> LookupTarget {
    LookupTarget {
        parent_id: parent_id.into(),
        name: name.to_owned(),
    }
}

fn allow(subject: &str, mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: subject.to_owned(),
            mode,
        })),
    }
}

fn deny(mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode })),
    }
}

fn error(result: &AttrResult) -> Result<ErrorCode> {
    assert!(result.object.is_none());
    Ok(result
        .error
        .as_ref()
        .context("missing result error")?
        .code())
}

async fn create_directory_child(
    tx: &Transaction,
    tenant: &TenantResource,
    parent_id: &ObjectId,
    name: &str,
    kind: ObjectKind,
) -> Result<ObjectId> {
    let parent = ObjectResource::fetch(tx, tenant, parent_id)
        .await?
        .context("missing parent")?;
    let child = DirectoryResource::try_from(parent)?
        .create_child(
            tx,
            ObjectId::new_v7(),
            name.to_owned(),
            kind,
            None,
            HashMap::new(),
        )
        .await?;
    Ok(child.object_id)
}

async fn attach(
    client: &mut DfsClient<Channel>,
    tenant_authorization: &str,
    object_id: ObjectId,
    grant: Grant,
) -> Result<()> {
    client
        .update_grants(with_authorization(
            UpdateGrantsRequest {
                object_id,
                changes: vec![GrantUpdate {
                    grant,
                    remove: false,
                }],
            },
            tenant_authorization,
        )?)
        .await?;
    Ok(())
}

pub(crate) async fn lookup_resolves_readable_children_and_conceals_the_rest() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let tenant = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants: vec![allow("reader", 0o6)],
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

    // Create RPCs are not implemented yet.
    let tx = fdb::database()?.create_trx()?;
    let resource = TenantResource::fetch(&tx, &tenant.tenant_id)
        .await?
        .context("missing tenant")?;
    let docs_id = create_directory_child(
        &tx,
        &resource,
        &tenant.root_id,
        "docs",
        ObjectKind::Directory,
    )
    .await?;
    let hidden_id = create_directory_child(
        &tx,
        &resource,
        &tenant.root_id,
        "hidden",
        ObjectKind::Directory,
    )
    .await?;
    let notes_id =
        create_directory_child(&tx, &resource, &docs_id, "notes.txt", ObjectKind::File).await?;
    let private_id =
        create_directory_child(&tx, &resource, &docs_id, "private.txt", ObjectKind::File).await?;
    let reopened_id = create_directory_child(
        &tx,
        &resource,
        &hidden_id,
        "reopened",
        ObjectKind::Directory,
    )
    .await?;
    tx.commit().await?;
    attach(&mut client, &tenant_authorization, private_id, deny(0o4)).await?;
    attach(&mut client, &tenant_authorization, hidden_id, deny(0o4)).await?;
    attach(
        &mut client,
        &tenant_authorization,
        reopened_id,
        allow("reader", 0o4),
    )
    .await?;

    let results = client
        .lookup(with_authorization(
            LookupRequest {
                targets: vec![
                    target(docs_id, "notes.txt"),
                    target(ObjectRef::Root, "docs"),
                    target(ObjectRef::Root, "shared"),
                    target(docs_id, "missing"),
                    target(docs_id, "private.txt"),
                    target(hidden_id, "reopened"),
                    target(notes_id, "child"),
                    target(ObjectRef::Shared, "docs"),
                    target(docs_id, "a/b"),
                    target(docs_id, &"é".repeat(128)),
                    target(docs_id, "notes.txt"),
                ],
                include_metadata: Some(true),
            },
            &authorization,
        )?)
        .await?
        .into_inner()
        .results;
    assert_eq!(results.len(), 11);
    let notes = results[0].object.as_ref().context("missing notes")?;
    assert!(results[0].error.is_none());
    assert_eq!(notes.id, notes_id.into());
    assert_eq!(notes.name, "notes.txt");
    assert_eq!(notes.kind(), ObjectKind::File);
    assert_eq!(notes.mode, 0o600);
    assert!(notes.metadata.is_some());
    assert_eq!(results[0], results[10]);
    let docs = results[1].object.as_ref().context("missing docs")?;
    assert_eq!(docs.id, docs_id.into());
    assert_eq!(docs.mode, 0o700);
    assert_eq!(docs.store_version, notes.store_version);
    let shared = results[2].object.as_ref().context("missing shared")?;
    assert_eq!(shared.id, ObjectRef::Shared);
    assert_eq!(shared.mode, 0o500);
    for (index, expected) in [
        (3, ErrorCode::NotFound),
        (4, ErrorCode::NotFound),
        (5, ErrorCode::NotFound),
        (6, ErrorCode::NotDirectory),
        (7, ErrorCode::Unsupported),
        (8, ErrorCode::InvalidInput),
        (9, ErrorCode::NameTooLong),
    ] {
        assert_eq!(error(&results[index])?, expected, "result {index}");
    }

    for targets in [
        vec![],
        vec![target(ObjectRef::Root, "docs"); 257],
        vec![
            target(ObjectRef::Root, "docs"),
            target(ObjectRef::Invalid, "docs"),
        ],
    ] {
        let status = client
            .lookup(with_authorization(
                LookupRequest {
                    targets,
                    include_metadata: None,
                },
                &authorization,
            )?)
            .await
            .err()
            .context("expected an invalid lookup request to fail")?;
        assert_eq!(error_code(&status)?, ErrorCode::InvalidInput);
    }
    Ok(())
}
