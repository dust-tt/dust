mod authorization;
mod entries;
mod grants;
mod mutations;

use std::sync::Arc;

use anyhow::{Context, Result, ensure};
use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use slatedb::{bytes::Bytes, object_store::memory::InMemory};

use super::*;
use crate::{
    api::{
        Access, router,
        sessions::tests::{SERVER_KEY, call, text},
    },
    model::{ContentVersionId, FileContent, MetadataRevision, ParentLink, WorkspaceId, Xattrs},
    storage::{BlobUpload, MetadataBatch, MetadataMutation, Storage},
};

struct Fixture {
    storage: Arc<Storage>,
    app: Router,
    workspace: WorkspaceId,
    key: String,
    workspace_key: String,
    root: ObjectId,
    private: ObjectMetadata,
    shared: ObjectMetadata,
    elsewhere: ObjectMetadata,
    files: Vec<ObjectMetadata>,
}

impl Fixture {
    async fn new() -> Result<Self> {
        let storage =
            Arc::new(Storage::open(Arc::new(InMemory::new()), &"objects".parse()?).await?);
        let app = router(ApiState::new(
            Some(storage.clone()),
            Access::new(Some(SERVER_KEY))?,
        ));
        let workspace = WorkspaceId::new("w")?;
        let (_, created) = call(
            &app,
            "POST",
            "/workspaces",
            Some(SERVER_KEY),
            json!({"workspace_id":"w","root_grants":["owner"]}),
        )
        .await?;
        let root = text(&created, "root_id")?.parse()?;
        let workspace_key = text(&created, "workspace_key")?.to_owned();
        let private = directory(&workspace, root, "private-ancestor")?;
        let shared = directory(&workspace, private.id, "shared-subtree")?;
        let elsewhere = directory(&workspace, private.id, "elsewhere")?;
        let mut batch = MetadataBatch::default();
        let mut root_record = storage
            .workspace(&workspace)?
            .read_view()
            .await?
            .object(root)
            .await?
            .context("root")?;
        root_record.metadata_revision = root_record.metadata_revision.next()?;
        batch
            .mutations
            .push(MetadataMutation::PutObject(root_record.into()));
        for object in [&private, &shared, &elsewhere] {
            add_object(&mut batch, object)?;
        }
        batch.mutations.push(MetadataMutation::SetGrant {
            object_id: shared.id,
            grant: "reader".to_owned(),
            attached: true,
        });
        let mut files = Vec::new();
        for name in ["A.txt", "a b%?.txt", "é.txt"] {
            let mut file = directory(&workspace, shared.id, name)?;
            let version = ContentVersionId::generate();
            file.kind = ObjectKind::File(FileContent {
                version,
                size_bytes: 2,
            });
            file.mime_type = "text/plain".parse()?;
            file.xattrs
                .insert("user.binary".to_owned(), vec![0, 128, 255]);
            add_object(&mut batch, &file)?;
            batch.uploads.push(BlobUpload {
                object_id: file.id,
                version,
                bytes: Bytes::from_static(b"hi"),
            });
            files.push(file);
        }
        storage.workspace(&workspace)?.commit(batch).await?;
        let (_, session) = call(
            &app,
            "POST",
            "/sessions",
            Some(&workspace_key),
            json!({"workspace_id":"w","grants":["reader"]}),
        )
        .await?;
        let key = text(&session, "session_key")?.to_owned();
        Ok(Self {
            storage,
            app,
            workspace,
            key,
            workspace_key,
            root,
            private,
            shared,
            elsewhere,
            files,
        })
    }

    async fn request(&self, path: &str, body: Value) -> Result<(StatusCode, Value)> {
        call(&self.app, "POST", path, Some(&self.key), body).await
    }

    async fn session_key(&self, grants: &[&str]) -> Result<String> {
        let (status, session) = call(
            &self.app,
            "POST",
            "/sessions",
            Some(&self.workspace_key),
            json!({"workspace_id":self.workspace.as_str(),"grants":grants}),
        )
        .await?;
        ensure!(status == StatusCode::CREATED);
        Ok(text(&session, "session_key")?.to_owned())
    }

    async fn close(self) -> Result<()> {
        drop(self.app);
        self.storage.close().await
    }
}

fn directory(workspace: &WorkspaceId, parent: ObjectId, name: &str) -> Result<ObjectMetadata> {
    Ok(ObjectMetadata {
        workspace_id: workspace.clone(),
        id: ObjectId::generate(),
        parent: Some(ParentLink {
            parent_id: parent,
            name: name.parse()?,
        }),
        kind: ObjectKind::Directory,
        mime_type: "inode/directory".parse()?,
        xattrs: Xattrs::new(),
        metadata_revision: MetadataRevision::INITIAL,
        posix: crate::model::PosixAttributes::new(true, crate::model::Timestamp::EPOCH),
    })
}

fn add_object(batch: &mut MetadataBatch, object: &ObjectMetadata) -> Result<()> {
    batch
        .mutations
        .push(MetadataMutation::PutObject(object.clone().into()));
    batch.mutations.push(MetadataMutation::PutChild(
        object.directory_entry().context("child link")?,
    ));
    Ok(())
}

#[tokio::test]
async fn reads_return_attributes_and_paginate_without_exposing_private_ancestors() -> Result<()> {
    let f = Fixture::new().await?;
    let (status, attributes) = f
        .request(
            "/objects/stat",
            json!({"object_id":f.files[0].id.to_string()}),
        )
        .await?;
    ensure!(status == StatusCode::OK);
    ensure!(
        attributes["kind"] == "file"
            && attributes["size_bytes"] == 2
            && attributes["mime_type"] == "text/plain"
    );
    ensure!(attributes["metadata_revision"] == 0 && attributes["content_version"].is_string());
    ensure!(STANDARD.decode(text(&attributes["xattrs"], "user.binary")?)? == [0, 128, 255]);
    for field in ["parent", "parent_id", "name", "path", "grants"] {
        ensure!(attributes.get(field).is_none());
    }
    ensure!(!attributes.to_string().contains(&f.private.id.to_string()));
    for id in [f.root, f.private.id, f.elsewhere.id, ObjectId::generate()] {
        ensure!(
            f.request("/objects/stat", json!({"object_id":id.to_string()}))
                .await?
                .0
                == StatusCode::NOT_FOUND
        );
        ensure!(
            f.request("/objects/list", json!({"directory_id":id.to_string()}))
                .await?
                .0
                == StatusCode::NOT_FOUND
        );
    }
    ensure!(
        f.request(
            "/objects/lookup",
            json!({"parent_id":f.private.id.to_string(),"name":"shared-subtree"})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    let (status, first) = f
        .request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"limit":2}),
        )
        .await?;
    ensure!(status == StatusCode::OK && first["entries"].as_array().context("entries")?.len() == 2);
    ensure!(
        first["entries"][0]["name"] == "A.txt" && first["entries"][0]["attributes"] == attributes
    );
    ensure!(first["next_after"] == "a b%?.txt");
    let (status, last) = f
        .request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"limit":1,"after":first["next_after"]}),
        )
        .await?;
    ensure!(
        status == StatusCode::OK
            && last["entries"][0]["name"] == "é.txt"
            && last["next_after"].is_null()
    );
    let (_, exhausted) = f
        .request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"after":"é.txt"}),
        )
        .await?;
    ensure!(exhausted["entries"] == json!([]) && exhausted["next_after"].is_null());
    let (status, looked_up) = f
        .request(
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"é.txt"}),
        )
        .await?;
    ensure!(status == StatusCode::OK && looked_up == last["entries"][0]["attributes"]);
    let (_, dir) = f
        .request(
            "/objects/stat",
            json!({"object_id":f.shared.id.to_string()}),
        )
        .await?;
    ensure!(dir["kind"] == "directory" && dir.get("size_bytes").is_none());
    f.close().await
}

#[tokio::test]
async fn moves_and_revocations_change_access_while_in_flight_reads_keep_one_snapshot() -> Result<()>
{
    let f = Fixture::new().await?;
    let mut moved = f.files[0].clone();
    moved.parent = Some(ParentLink {
        parent_id: f.elsewhere.id,
        name: "moved.txt".parse()?,
    });
    moved.metadata_revision = moved.metadata_revision.next()?;
    let mut batch = MetadataBatch::default();
    add_object(&mut batch, &moved)?;
    batch.mutations.push(MetadataMutation::DeleteChild {
        parent_id: f.shared.id,
        name: "A.txt".parse()?,
    });
    for mut parent in [f.shared.clone(), f.elsewhere.clone()] {
        parent.metadata_revision = parent.metadata_revision.next()?;
        batch
            .mutations
            .push(MetadataMutation::PutObject(parent.into()));
    }
    f.storage.workspace(&f.workspace)?.commit(batch).await?;
    ensure!(
        f.request("/objects/stat", json!({"object_id":moved.id.to_string()}))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        f.request(
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"A.txt"})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    let grants = ["reader".to_owned()].into();
    let in_flight = NamespaceRead::new(&f.storage, &f.workspace, &grants).await?;
    f.storage
        .workspace(&f.workspace)?
        .commit(MetadataBatch {
            mutations: vec![
                MetadataMutation::SetGrant {
                    object_id: f.shared.id,
                    grant: "reader".to_owned(),
                    attached: false,
                },
                MetadataMutation::SetGrant {
                    object_id: moved.id,
                    grant: "reader".to_owned(),
                    attached: true,
                },
            ],
            uploads: vec![],
        })
        .await?;
    ensure!(in_flight.stat(f.files[1].id).await?.id == f.files[1].id);
    ensure!(
        f.request(
            "/objects/stat",
            json!({"object_id":f.files[1].id.to_string()})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    ensure!(
        f.request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"after":"a b%?.txt"})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    ensure!(
        f.request("/objects/stat", json!({"object_id":moved.id.to_string()}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.request(
            "/objects/list",
            json!({"directory_id":f.elsewhere.id.to_string()})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    drop(in_flight);
    f.close().await
}

#[tokio::test]
async fn read_routes_validate_credentials_inputs_and_workspace_scope() -> Result<()> {
    let f = Fixture::new().await?;
    for (route, body) in [
        (
            "/objects/stat",
            json!({"object_id":f.files[0].id.to_string()}),
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"A.txt"}),
        ),
        (
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string()}),
        ),
    ] {
        for key in [None, Some(f.workspace_key.as_str()), Some(SERVER_KEY)] {
            ensure!(
                call(&f.app, "POST", route, key, body.clone()).await?.0 == StatusCode::UNAUTHORIZED
            );
        }
    }
    for (route, body, code) in [
        (
            "/objects/stat",
            json!({"object_id":"invalid"}),
            "invalid_input",
        ),
        (
            "/objects/stat",
            json!({"object_id":f.root.to_string(),"workspace_id":"other"}),
            "invalid_input",
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":".."}),
            "invalid_input",
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"a/b"}),
            "invalid_input",
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"a".repeat(256)}),
            "name_too_long",
        ),
        (
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"limit":0}),
            "invalid_input",
        ),
        (
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"limit":1001}),
            "invalid_input",
        ),
        (
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"after":"../"}),
            "invalid_input",
        ),
        (
            "/objects/list",
            json!({"directory_id":f.files[0].id.to_string()}),
            "not_directory",
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.files[0].id.to_string(),"name":"anything"}),
            "not_directory",
        ),
    ] {
        let (status, body) = f.request(route, body).await?;
        ensure!(status == StatusCode::BAD_REQUEST && body["error"]["code"] == code);
    }
    let (_, created) = call(
        &f.app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"other"}),
    )
    .await?;
    let (_, other) = call(
        &f.app,
        "POST",
        "/sessions",
        Some(text(&created, "workspace_key")?),
        json!({"workspace_id":"other","grants":["reader"]}),
    )
    .await?;
    for (route, body) in [
        (
            "/objects/stat",
            json!({"object_id":f.files[0].id.to_string()}),
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"A.txt"}),
        ),
        (
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string()}),
        ),
    ] {
        ensure!(
            call(
                &f.app,
                "POST",
                route,
                Some(text(&other, "session_key")?),
                body
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
    }
    for grants in [vec![], vec!["reader/suffix"]] {
        let (_, session) = call(
            &f.app,
            "POST",
            "/sessions",
            Some(&f.workspace_key),
            json!({"workspace_id":"w","grants":grants}),
        )
        .await?;
        ensure!(
            call(
                &f.app,
                "POST",
                "/objects/stat",
                Some(text(&session, "session_key")?),
                json!({"object_id":f.files[0].id.to_string()})
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
    }
    f.close().await
}

#[tokio::test]
async fn inconsistent_children_and_ancestor_cycles_fail_closed() -> Result<()> {
    let f = Fixture::new().await?;
    let mut corrupt = f.files[0].clone();
    corrupt.parent = Some(ParentLink {
        parent_id: f.elsewhere.id,
        name: "wrong".parse()?,
    });
    f.storage
        .workspace(&f.workspace)?
        .commit(MetadataBatch {
            mutations: vec![MetadataMutation::PutObject(corrupt.into())],
            uploads: vec![],
        })
        .await?;
    ensure!(
        f.request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string()})
        )
        .await?
        .0 == StatusCode::SERVICE_UNAVAILABLE
    );
    ensure!(
        f.request(
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"A.txt"})
        )
        .await?
        .0 == StatusCode::SERVICE_UNAVAILABLE
    );
    let mut cycle = f.private.clone();
    cycle.parent = Some(ParentLink {
        parent_id: f.elsewhere.id,
        name: "cycle".parse()?,
    });
    let mut batch = MetadataBatch::default();
    add_object(&mut batch, &cycle)?;
    batch.mutations.push(MetadataMutation::DeleteChild {
        parent_id: f.root,
        name: "private-ancestor".parse()?,
    });
    f.storage.workspace(&f.workspace)?.commit(batch).await?;
    let (status, _) = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        f.request(
            "/objects/stat",
            json!({"object_id":f.private.id.to_string()}),
        ),
    )
    .await??;
    ensure!(status == StatusCode::SERVICE_UNAVAILABLE);
    f.close().await
}
