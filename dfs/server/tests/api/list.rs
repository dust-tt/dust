use anyhow::{Context, Result};
use dfs_api::storage::{fdb, resources::tenant::TenantResource};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{
        Attr, CreateSessionRequest, CreateTenantRequest, EntryPage, ErrorCode, ListRequest,
        ObjectKind, dfs_client::DfsClient,
    },
};
use tonic::{Status, transport::Channel};

use super::{allow, attach, create_directory_child, deny};
use crate::{MASTER_KEY, error_code, serve, with_authorization};

fn request(directory_id: impl Into<ObjectRef>, after: Option<&str>, limit: u32) -> ListRequest {
    ListRequest {
        directory_id: directory_id.into(),
        after: after.map(str::to_owned),
        limit,
    }
}

fn names(page: &EntryPage) -> Vec<&str> {
    page.entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect()
}

fn attr<'a>(page: &'a EntryPage, name: &str) -> Result<&'a Attr> {
    page.entries
        .iter()
        .find(|entry| entry.name == name)
        .and_then(|entry| entry.object.as_ref())
        .context("missing listed entry")
}

async fn list(
    client: &mut DfsClient<Channel>,
    authorization: &str,
    request: ListRequest,
) -> Result<Result<EntryPage, Status>> {
    Ok(client
        .list(with_authorization(request, authorization)?)
        .await
        .map(tonic::Response::into_inner))
}

pub(crate) async fn list_returns_readable_entries_and_conceals_the_rest() -> Result<()> {
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

    // Seed the directory tree through resources before testing List over gRPC.
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
    tx.commit().await?;
    attach(&mut client, &tenant_authorization, private_id, deny(0o4)).await?;
    attach(&mut client, &tenant_authorization, hidden_id, deny(0o4)).await?;

    let root = list(
        &mut client,
        &authorization,
        request(ObjectRef::Root, None, 4_096),
    )
    .await??;
    assert_eq!(names(&root), ["docs", "shared"]);
    assert_eq!(root.next_after, None);
    let docs = attr(&root, "docs")?;
    assert_eq!(docs.id, docs_id.into());
    assert_eq!(docs.mode, 0o700);
    assert_eq!(docs.metadata, None);
    let shared = attr(&root, "shared")?;
    assert_eq!(shared.id, ObjectRef::Shared);
    assert_eq!(shared.mode, 0o500);
    assert_eq!(shared.store_version, docs.store_version);

    let first = list(&mut client, &authorization, request(docs_id, None, 1)).await??;
    assert_eq!(names(&first), ["notes.txt"]);
    let notes = attr(&first, "notes.txt")?;
    assert_eq!(notes.id, notes_id.into());
    assert_eq!(notes.mode, 0o600);
    let after = first.next_after.context("missing cursor after notes")?;
    let second = list(
        &mut client,
        &authorization,
        request(docs_id, Some(&after), 1),
    )
    .await??;
    assert!(second.entries.is_empty());
    assert_eq!(second.next_after, None);

    for (request, expected) in [
        (request(hidden_id, None, 1), ErrorCode::NotFound),
        (request(ObjectId::new_v7(), None, 1), ErrorCode::NotFound),
        (request(notes_id, None, 1), ErrorCode::NotDirectory),
        (
            request(ObjectRef::Invalid, None, 1),
            ErrorCode::InvalidInput,
        ),
        (request(docs_id, None, 0), ErrorCode::InvalidInput),
        (request(docs_id, None, 4_097), ErrorCode::InvalidInput),
        (request(docs_id, Some("AAAA"), 1), ErrorCode::InvalidInput),
        (
            request(tenant.root_id, Some(&after), 1),
            ErrorCode::InvalidInput,
        ),
    ] {
        let status = list(&mut client, &authorization, request)
            .await?
            .err()
            .context("expected the list request to fail")?;
        assert_eq!(error_code(&status)?, expected);
    }
    Ok(())
}
