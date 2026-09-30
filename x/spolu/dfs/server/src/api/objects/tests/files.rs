use axum::{
    body::{Body, to_bytes},
    http::{Request, header},
    response::Response,
};
use futures::{StreamExt, stream};
use slatedb::object_store::{ObjectStore, local::LocalFileSystem};
use std::time::Duration;
use tokio::sync::{Notify, mpsc};
use tower::ServiceExt;

use super::*;
use crate::{files::FileConfig, model::RequestId, storage::StoragePrefix};

async fn open_handle(f: &Fixture, id: ObjectId, append: bool) -> Result<String> {
    let (status, response) = f
        .request(
            "/files/open",
            json!({"object_id":id.to_string(),"write":true,"append":append}),
        )
        .await?;
    ensure!(status == StatusCode::OK, "{response}");
    Ok(text(&response, "handle_id")?.to_owned())
}

async fn write_body(
    f: &Fixture,
    handle: &str,
    request: RequestId,
    sequence: u64,
    offset: u64,
    length: u64,
    body: Body,
) -> Result<(StatusCode, Value)> {
    write_to(
        &f.app, &f.key, handle, request, sequence, offset, length, body,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn write_to(
    app: &Router,
    key: &str,
    handle: &str,
    request: RequestId,
    sequence: u64,
    offset: u64,
    length: u64,
    body: Body,
) -> Result<(StatusCode, Value)> {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/files/write")
                .header(header::AUTHORIZATION, format!("Bearer {key}"))
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .header("dfs-handle-id", handle)
                .header("dfs-request-id", request.to_string())
                .header("dfs-write-sequence", sequence)
                .header("dfs-write-offset", offset)
                .header("dfs-write-length", length)
                .body(body)?,
        )
        .await?;
    let status = response.status();
    Ok((
        status,
        serde_json::from_slice(&to_bytes(response.into_body(), 64 * 1024).await?)?,
    ))
}

async fn read_response(
    f: &Fixture,
    key: &str,
    handle: &str,
    version: Option<String>,
    offset: u64,
    length: u64,
) -> Result<Response> {
    Ok(f.app.clone().oneshot(Request::builder().method("POST").uri("/files/read")
        .header(header::AUTHORIZATION, format!("Bearer {key}"))
        .header(header::CONTENT_TYPE,"application/json")
        .body(Body::from(serde_json::to_vec(&json!({"handle_id":handle,"content_version":version,"offset":offset,"length":length}))?))?).await?)
}

async fn read_bytes(f: &Fixture, handle: &str) -> Result<Bytes> {
    let response = read_response(f, &f.key, handle, None, 0, u64::MAX).await?;
    ensure!(response.status() == StatusCode::OK);
    Ok(to_bytes(response.into_body(), 1024 * 1024).await?)
}

async fn create_file(f: &Fixture, name: &str, bytes: &'static [u8]) -> Result<Value> {
    let upload = uploads::start_create(f, name).await?;
    let id = text(&upload, "upload_id")?;
    ensure!(
        uploads::send_content(&f.app, &f.key, id, Body::from(bytes))
            .await?
            .0
            == StatusCode::OK
    );
    let (status, receipt) = f
        .request("/uploads/commit", json!({"upload_id":id}))
        .await?;
    ensure!(status == StatusCode::OK, "{receipt}");
    Ok(receipt)
}

#[tokio::test]
async fn uploads_publish_once_preserve_attributes_and_recheck_content_preconditions() -> Result<()>
{
    let f = Fixture::new().await?;
    let upload = uploads::start_create(&f, "created").await?;
    let id = text(&upload, "upload_id")?;
    ensure!(
        f.request("/uploads/commit", json!({"upload_id":id}))
            .await?
            .0
            == StatusCode::CONFLICT
    );
    uploads::send_content(&f.app, &f.key, id, Body::from("content")).await?;
    let body =
        json!({"upload_id":id,"mime_type":"text/plain","mode":384,"xattrs":{"user.binary":"AP8="}});
    let (status, first) = f.request("/uploads/commit", body.clone()).await?;
    ensure!(status == StatusCode::OK, "{first}");
    let before = f
        .storage
        .workspace(&f.workspace)?
        .read_view()
        .await?
        .sequence()
        .await?;
    ensure!(f.request("/uploads/commit", body).await?.1 == first);
    ensure!(
        f.request("/uploads/commit", json!({"upload_id":id}))
            .await?
            .0
            == StatusCode::CONFLICT
    );
    ensure!(
        f.storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .sequence()
            .await?
            == before
    );
    ensure!(
        f.request("/uploads/status", json!({"upload_id":id}))
            .await?
            .1["published"]
            == true
    );
    let object: ObjectId = text(&first, "object_id")?.parse()?;
    let (_, attrs) = f
        .request("/objects/stat", json!({"object_id":object.to_string()}))
        .await?;
    ensure!(attrs["mode"] == 384 && attrs["xattrs"]["user.binary"] == "AP8=");
    let (_, replacement) = f.request("/uploads/start",json!({"operation":"replace","object_id":object.to_string(),"expected_content_version":text(&first,"content_version")?})).await?;
    let replacement_id = text(&replacement, "upload_id")?;
    uploads::send_content(&f.app, &f.key, replacement_id, Body::from("new")).await?;
    ensure!(f.request("/objects/update",json!({"object_id":object.to_string(),"expected_metadata_revision":0,"mode":448,"mime_type":"text/markdown"})).await?.0 == StatusCode::OK);
    let (status, replacement) = f
        .request("/uploads/commit", json!({"upload_id":replacement_id}))
        .await?;
    ensure!(status == StatusCode::OK && replacement["metadata_revision"] == 2);
    let (_, attrs) = f
        .request("/objects/stat", json!({"object_id":object.to_string()}))
        .await?;
    ensure!(attrs["mime_type"] == "text/markdown" && attrs["mode"] == 448);
    let handle = open_handle(&f, object, false).await?;
    ensure!(read_bytes(&f, &handle).await? == b"new"[..]);
    // Old versions, including uncommitted uploads, cannot be selected via the read API.
    ensure!(
        read_response(
            &f,
            &f.key,
            &handle,
            Some(text(&first, "content_version")?.to_owned()),
            0,
            7
        )
        .await?
        .status()
            == StatusCode::CONFLICT
    );
    f.close().await
}

#[tokio::test]
async fn published_uploads_release_capacity_and_keep_durable_retries() -> Result<()> {
    let f = Fixture::new().await?;
    let upload = uploads::start_create(&f, "published").await?;
    let id = text(&upload, "upload_id")?;
    ensure!(
        uploads::send_content(&f.app, &f.key, id, Body::from("content"))
            .await?
            .0
            == StatusCode::OK
    );
    // Pending reservations may share a name; no directory entry exists until publication.
    for _ in 1..1024 {
        uploads::start_create(&f, "pending").await?;
    }
    let next = json!({"operation":"create","parent_id":f.shared.id.to_string(),"name":"next"});
    ensure!(f.request("/uploads/start", next.clone()).await?.0 == StatusCode::INSUFFICIENT_STORAGE);
    // Failed publication must retain the completed upload so the caller can correct its request.
    ensure!(
        f.request("/uploads/commit", json!({"upload_id":id,"mode":512}))
            .await?
            .0
            == StatusCode::NOT_IMPLEMENTED
    );
    ensure!(f.request("/uploads/start", next.clone()).await?.0 == StatusCode::INSUFFICIENT_STORAGE);
    let commit = json!({"upload_id":id});
    let (status, receipt) = f.request("/uploads/commit", commit.clone()).await?;
    ensure!(status == StatusCode::OK, "{receipt}");
    let (status, reserved) = f.request("/uploads/start", next.clone()).await?;
    ensure!(status == StatusCode::CREATED, "{reserved}");
    ensure!(f.request("/uploads/start", next.clone()).await?.0 == StatusCode::INSUFFICIENT_STORAGE);
    // The freed slot is reused; concurrent retries must neither republish nor free another slot.
    let (first, second) = tokio::join!(
        f.request("/uploads/commit", commit.clone()),
        f.request("/uploads/commit", commit),
    );
    for result in [first, second] {
        let (status, replayed) = result?;
        ensure!(status == StatusCode::OK && replayed == receipt);
    }
    let (status, published) = f
        .request("/uploads/status", json!({"upload_id":id}))
        .await?;
    ensure!(status == StatusCode::OK && published["published"] == true);
    ensure!(f.request("/uploads/start", next).await?.0 == StatusCode::INSUFFICIENT_STORAGE);
    f.close().await
}

#[tokio::test]
async fn random_writes_sparse_extension_truncation_and_retries_are_visible_to_other_sessions()
-> Result<()> {
    let f = Fixture::new().await?;
    let handle = open_handle(&f, f.files[0].id, false).await?;
    let id = RequestId::generate();
    let (status, receipt) = write_body(&f, &handle, id, 1, 4, 2, Body::from("xy")).await?;
    ensure!(status == StatusCode::OK, "{receipt}");
    ensure!(read_bytes(&f, &handle).await? == b"hi\0\0xy"[..]);
    ensure!(
        write_body(&f, &handle, id, 1, 4, 2, Body::from("xy"))
            .await?
            .1
            == receipt
    );
    let other = f.session_key(&["reader"]).await?;
    let (status, opened) = call(
        &f.app,
        "POST",
        "/files/open",
        Some(&other),
        json!({"object_id":f.files[0].id.to_string()}),
    )
    .await?;
    ensure!(status == StatusCode::OK);
    let response = read_response(
        &f,
        &other,
        text(&opened, "handle_id")?,
        Some(text(&receipt, "content_version")?.to_owned()),
        2,
        20,
    )
    .await?;
    ensure!(
        response.status() == StatusCode::OK && response.headers()[header::CONTENT_LENGTH] == "4"
    );
    ensure!(to_bytes(response.into_body(), 100).await? == b"\0\0xy"[..]);
    ensure!(
        read_response(&f, &other, &handle, None, 0, 2)
            .await?
            .status()
            == StatusCode::NOT_FOUND
    );
    for (sequence, size, expected) in [
        (2, 1, b"h".as_slice()),
        (3, 4, b"h\0\0\0".as_slice()),
        (4, 0, b"".as_slice()),
    ] {
        let (status, result) = f.request("/files/truncate",json!({"handle_id":handle,"request_id":RequestId::generate().to_string(),"sequence":sequence,"size_bytes":size})).await?;
        ensure!(status == StatusCode::OK, "{result}");
        ensure!(read_bytes(&f, &handle).await? == expected);
    }
    ensure!(
        f.request(
            "/files/fsync",
            json!({"handle_id":handle,"through_sequence":4})
        )
        .await?
        .0 == StatusCode::NO_CONTENT
    );
    ensure!(
        f.request(
            "/files/fsync",
            json!({"handle_id":handle,"through_sequence":5})
        )
        .await?
        .0 == StatusCode::CONFLICT
    );
    ensure!(
        read_response(&f, &f.key, &handle, None, u64::MAX, u64::MAX)
            .await?
            .headers()[header::CONTENT_LENGTH]
            == "0"
    );
    let (status, receipt) = write_body(
        &f,
        &handle,
        RequestId::generate(),
        5,
        u64::MAX,
        0,
        Body::empty(),
    )
    .await?;
    ensure!(status == StatusCode::OK && receipt["size_bytes"] == 0);
    ensure!(read_bytes(&f, &handle).await?.is_empty());
    f.close().await
}

#[tokio::test]
async fn concurrent_appends_serialize_and_replays_do_not_duplicate_data() -> Result<()> {
    let f = Fixture::new().await?;
    let mut handles = Vec::new();
    for _ in 0..8 {
        handles.push(open_handle(&f, f.files[0].id, true).await?);
    }
    let ids: Vec<_> = (0..8).map(|_| RequestId::generate()).collect();
    let results = futures::future::join_all(handles.iter().zip(&ids).enumerate().map(
        |(i, (handle, id))| write_body(&f, handle, *id, 1, 900, 1, Body::from(i.to_string())),
    ))
    .await;
    for result in results {
        let (status, receipt) = result?;
        ensure!(status == StatusCode::OK, "{receipt}");
    }
    let bytes = read_bytes(&f, &handles[0]).await?;
    ensure!(&bytes[..2] == b"hi" && bytes.len() == 10);
    let mut appended = bytes[2..].to_vec();
    appended.sort();
    ensure!(appended == b"01234567");
    ensure!(
        write_body(&f, &handles[0], ids[0], 1, 42, 1, Body::from("0"))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(read_bytes(&f, &handles[0]).await? == bytes);
    ensure!(
        write_body(&f, &handles[0], ids[0], 1, 42, 1, Body::from("9"))
            .await?
            .0
            == StatusCode::CONFLICT
    );
    f.close().await
}

#[tokio::test]
async fn fsync_waits_for_the_stream_and_failed_writes_require_resolution() -> Result<()> {
    let f = Fixture::new().await?;
    let handle = open_handle(&f, f.files[0].id, false).await?;
    let other = open_handle(&f, f.files[1].id, false).await?;
    let notify = Arc::new(Notify::new());
    let signal = notify.clone();
    let (send, recv) = mpsc::channel(1);
    let body = stream::once(async move {
        signal.notify_one();
        Ok::<_, std::io::Error>(Bytes::from_static(b"a"))
    })
    .chain(stream::unfold(recv, |mut recv| async move {
        recv.recv().await.map(|x| (x, recv))
    }));
    let app = f.app.clone();
    let key = f.key.clone();
    let handle_clone = handle.clone();
    let writing = tokio::spawn(async move {
        write_to(
            &app,
            &key,
            &handle_clone,
            RequestId::generate(),
            1,
            0,
            2,
            Body::from_stream(body),
        )
        .await
    });
    notify.notified().await;
    let mut barrier = Box::pin(f.request(
        "/files/fsync",
        json!({"handle_id":handle,"through_sequence":1}),
    ));
    ensure!(futures::poll!(barrier.as_mut()).is_pending());
    ensure!(
        tokio::time::timeout(
            Duration::from_secs(5),
            write_body(&f, &other, RequestId::generate(), 1, 0, 1, Body::from("z"))
        )
        .await??
        .0 == StatusCode::OK
    );
    send.send(Ok(Bytes::from_static(b"b"))).await?;
    drop(send);
    ensure!(writing.await??.0 == StatusCode::OK);
    ensure!(barrier.await?.0 == StatusCode::NO_CONTENT);
    let request = RequestId::generate();
    let interrupted = Body::from_stream(stream::iter([
        Ok(Bytes::from_static(b"bad")),
        Err(std::io::Error::other("disconnect")),
    ]));
    ensure!(
        write_body(&f, &handle, request, 2, 0, 4, interrupted)
            .await?
            .0
            == StatusCode::BAD_REQUEST
    );
    ensure!(read_bytes(&f, &handle).await? == b"ab"[..]);
    ensure!(
        f.request(
            "/files/fsync",
            json!({"handle_id":handle,"through_sequence":2})
        )
        .await?
        .0 == StatusCode::BAD_REQUEST
    );
    ensure!(
        write_body(&f, &handle, RequestId::generate(), 3, 0, 1, Body::from("x"))
            .await?
            .0
            == StatusCode::CONFLICT
    );
    ensure!(
        write_body(&f, &handle, request, 2, 0, 4, Body::from("good"))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.request(
            "/files/fsync",
            json!({"handle_id":handle,"through_sequence":2})
        )
        .await?
        .0 == StatusCode::NO_CONTENT
    );
    f.close().await
}

#[tokio::test]
async fn handles_observe_rename_unlink_readonly_and_exhaustion() -> Result<()> {
    let f = Fixture::new().await?;
    let handle = open_handle(&f, f.files[0].id, false).await?;
    ensure!(f.request("/objects/rename",json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,"parent_id":f.shared.id.to_string(),"name":"moved"})).await?.0==StatusCode::OK);
    ensure!(read_bytes(&f, &handle).await? == b"hi"[..]);
    ensure!(
        f.request(
            "/objects/unlink",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":1})
        )
        .await?
        .0 == StatusCode::NO_CONTENT
    );
    ensure!(
        read_response(&f, &f.key, &handle, None, 0, 2)
            .await?
            .status()
            == StatusCode::NOT_FOUND
    );
    ensure!(
        f.request("/files/close", json!({"handle_id":handle}))
            .await?
            .0
            == StatusCode::NO_CONTENT
    );
    let (_, read) = f
        .request(
            "/files/open",
            json!({"object_id":f.files[1].id.to_string()}),
        )
        .await?;
    ensure!(
        write_body(
            &f,
            text(&read, "handle_id")?,
            RequestId::generate(),
            1,
            0,
            1,
            Body::from("x")
        )
        .await?
        .0 == StatusCode::FORBIDDEN
    );
    let (_,truncated)=f.request("/files/open",json!({"object_id":f.files[1].id.to_string(),"write":true,"truncate":true,"request_id":RequestId::generate().to_string()})).await?;
    ensure!(truncated["sequence"] == 1 && truncated["attributes"]["size_bytes"] == 0);
    for _ in 2..256 {
        open_handle(&f, f.files[2].id, false).await?;
    }
    ensure!(
        f.request(
            "/files/open",
            json!({"object_id":f.files[2].id.to_string()})
        )
        .await?
        .0 == StatusCode::INSUFFICIENT_STORAGE
    );
    ensure!(
        f.request(
            "/files/close",
            json!({"handle_id":text(&read,"handle_id")?})
        )
        .await?
        .0 == StatusCode::NO_CONTENT
    );
    open_handle(&f, f.files[2].id, false).await?;
    f.close().await
}

// Also exercises GCS, recovery of request receipts, and invalidation of old sessions/handles.
pub(crate) async fn exercise_files(
    store: Arc<dyn ObjectStore>,
    prefix: &StoragePrefix,
) -> Result<()> {
    let storage = Arc::new(Storage::open(store.clone(), prefix).await?);
    let f = Fixture::from_storage(storage, FileConfig::default()).await?;
    let created = create_file(&f, "persisted", b"start").await?;
    let object: ObjectId = text(&created, "object_id")?.parse()?;
    let handle = open_handle(&f, object, true).await?;
    let id = RequestId::generate();
    let (status, receipt) = write_body(&f, &handle, id, 1, 0, 1, Body::from("!")).await?;
    ensure!(status == StatusCode::OK);
    ensure!(
        f.request(
            "/files/fsync",
            json!({"handle_id":handle,"through_sequence":1})
        )
        .await?
        .0 == StatusCode::NO_CONTENT
    );
    let workspace_key = f.workspace_key.clone();
    let old_key = f.key.clone();
    f.close().await?;
    let storage = Arc::new(Storage::open(store, prefix).await?);
    let state = ApiState::new(Some(storage.clone()), Access::new(Some(SERVER_KEY))?);
    let app = router(state.clone());
    ensure!(
        call(
            &app,
            "POST",
            "/files/fsync",
            Some(&old_key),
            json!({"handle_id":handle,"through_sequence":1})
        )
        .await?
        .0 == StatusCode::UNAUTHORIZED
    );
    let (_, session) = call(
        &app,
        "POST",
        "/sessions",
        Some(&workspace_key),
        json!({"workspace_id":"w","grants":["reader"]}),
    )
    .await?;
    let key = text(&session, "session_key")?;
    let (status, recovered) = call(
        &app,
        "POST",
        "/files/status",
        Some(key),
        json!({"object_id":object.to_string(),"request_id":id.to_string()}),
    )
    .await?;
    ensure!(status == StatusCode::OK && recovered == receipt);
    let (status, again) = call(
        &app,
        "POST",
        "/uploads/commit",
        Some(key),
        json!({"upload_id":text(&created,"request_id")?}),
    )
    .await?;
    ensure!(status == StatusCode::OK && again == created);
    let (_, opened) = call(
        &app,
        "POST",
        "/files/open",
        Some(key),
        json!({"object_id":object.to_string(),"write":true,"append":true}),
    )
    .await?;
    ensure!(
        write_to(
            &app,
            key,
            text(&opened, "handle_id")?,
            id,
            1,
            0,
            1,
            Body::from("!")
        )
        .await?
        .1 == receipt
    );
    let bytes = storage
        .workspace(&WorkspaceId::new("w")?)?
        .read_blob(object, text(&receipt, "content_version")?.parse()?)
        .await?;
    ensure!(bytes == b"start!"[..]);
    state.drain_file_jobs().await;
    drop(app);
    storage.close().await
}

#[tokio::test]
async fn file_receipts_and_bytes_survive_reopening() -> Result<()> {
    let directory = tempfile::tempdir()?;
    exercise_files(
        Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
        &"files".parse()?,
    )
    .await
}

#[tokio::test]
async fn large_disk_edits_stream_beyond_memory_budget_and_enforce_scratch_quota() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let scratch = tempfile::tempdir()?;
    let storage = Arc::new(
        Storage::open(
            Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
            &"large".parse()?,
        )
        .await?,
    );
    let size = 80 * 1024 * 1024;
    let f = Fixture::from_storage(
        storage,
        FileConfig {
            scratch_dir: scratch.path().to_owned(),
            scratch_bytes: size,
            file_mutations: 16,
        },
    )
    .await?;
    let handle = open_handle(&f, f.files[0].id, false).await?;
    let (status,result)=f.request("/files/truncate",json!({"handle_id":handle,"request_id":RequestId::generate().to_string(),"sequence":1,"size_bytes":size})).await?;
    ensure!(status == StatusCode::OK, "{result}");
    let request = RequestId::generate();
    ensure!(
        write_body(&f, &handle, request, 2, size - 2, 2, Body::from("xy"))
            .await?
            .0
            == StatusCode::OK
    );
    let response = read_response(&f, &f.key, &handle, None, 0, u64::MAX).await?;
    ensure!(response.status() == StatusCode::OK);
    let mut stream = response.into_body().into_data_stream();
    let mut total = 0_u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        ensure!(chunk.len() <= 1024 * 1024);
        if total == 0 {
            ensure!(&chunk[..2] == b"hi");
        }
        total += chunk.len() as u64;
    }
    ensure!(total == size);
    let tail = read_response(&f, &f.key, &handle, None, size - 4, 100).await?;
    ensure!(to_bytes(tail.into_body(), 10).await? == b"\0\0xy"[..]);
    ensure!(f.request("/files/truncate",json!({"handle_id":handle,"request_id":RequestId::generate().to_string(),"sequence":3,"size_bytes":size+1})).await?.0==StatusCode::INSUFFICIENT_STORAGE);
    ensure!(std::fs::read_dir(scratch.path())?.next().is_none());
    f.close().await
}

#[tokio::test]
async fn inflight_edits_reauthorize_and_preserve_intervening_metadata() -> Result<()> {
    for revoke in [false, true] {
        let f = Fixture::new().await?;
        let handle = open_handle(&f, f.files[0].id, false).await?;
        let notify = Arc::new(Notify::new());
        let signal = notify.clone();
        let (send, recv) = mpsc::channel(1);
        let body = stream::once(async move {
            signal.notify_one();
            Ok::<_, std::io::Error>(Bytes::from_static(b"n"))
        })
        .chain(stream::unfold(recv, |mut recv| async move {
            recv.recv().await.map(|x| (x, recv))
        }));
        let app = f.app.clone();
        let key = f.key.clone();
        let handle_clone = handle.clone();
        let writing = tokio::spawn(async move {
            write_to(
                &app,
                &key,
                &handle_clone,
                RequestId::generate(),
                1,
                0,
                3,
                Body::from_stream(body),
            )
            .await
        });
        notify.notified().await;
        ensure!(f.request("/objects/update",json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,"mode":448,"mime_type":"text/markdown"})).await?.0==StatusCode::OK);
        if revoke {
            ensure!(
                f.patch_grants(f.shared.id, 0, json!({"reader":false}))
                    .await?
                    .0
                    == StatusCode::OK
            );
        }
        send.send(Ok(Bytes::from_static(b"ew"))).await?;
        drop(send);
        ensure!(
            writing.await??.0
                == if revoke {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::OK
                }
        );
        let object = f
            .storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .object(f.files[0].id)
            .await?
            .context("file")?;
        ensure!(object.mime_type == "text/markdown" && object.posix.mode == 448);
        let ObjectKind::File(content) = object.kind else {
            anyhow::bail!("file")
        };
        ensure!(
            f.storage
                .workspace(&f.workspace)?
                .read_blob(object.id, content.version)
                .await?
                == if revoke {
                    b"hi".as_slice()
                } else {
                    b"new".as_slice()
                }
        );
        f.close().await?;
    }
    Ok(())
}

#[tokio::test]
async fn readers_pin_versions_and_stale_uploads_cannot_overwrite_a_newer_write() -> Result<()> {
    let f = Fixture::new().await?;
    let handle = open_handle(&f, f.files[0].id, false).await?;
    let ObjectKind::File(old) = &f.files[0].kind else {
        anyhow::bail!("file")
    };
    let (_,upload)=f.request("/uploads/start",json!({"operation":"replace","object_id":f.files[0].id.to_string(),"expected_content_version":old.version.to_string()})).await?;
    let id = text(&upload, "upload_id")?;
    uploads::send_content(&f.app, &f.key, id, Body::from("stale")).await?;
    let pinned = read_response(&f, &f.key, &handle, Some(old.version.to_string()), 0, 2).await?;
    ensure!(
        write_body(
            &f,
            &handle,
            RequestId::generate(),
            1,
            0,
            3,
            Body::from("new")
        )
        .await?
        .0 == StatusCode::OK
    );
    ensure!(
        f.request("/uploads/commit", json!({"upload_id":id}))
            .await?
            .0
            == StatusCode::CONFLICT
    );
    ensure!(to_bytes(pinned.into_body(), 10).await? == b"hi"[..]);
    ensure!(read_bytes(&f, &handle).await? == b"new"[..]);
    f.close().await
}

mod cached;
