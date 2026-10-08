use super::*;

fn fenced_write(node: &Node, handle: &str, bytes: &[u8]) -> Mutation {
    Mutation::Write {
        node: node.id.clone(),
        base: node.version.clone(),
        offset: 0,
        data: bytes.to_vec(),
        append: false,
        handle: Some(handle.into()),
    }
}

#[test]
fn exclusive_writers_share_a_generation_and_fence_all_other_content_publication() {
    let f = Fixture::new();
    let file = f.create(&f.root, "file", Kind::File);
    let other = f.create(&f.root, "other", Kind::File);
    let remote = f.engine.login("admin").unwrap();
    let (legacy, _) = f.engine.open_handle(&remote.id, &file.id, true).unwrap();
    let request = id();
    let first = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &request)
        .unwrap();
    let retry = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &request)
        .unwrap();
    assert_eq!(first.handle, retry.handle);
    assert_eq!(first.lease, retry.lease);
    let second = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &id())
        .unwrap();
    assert_eq!(first.lease, second.lease);
    assert_ne!(first.handle, second.handle);
    assert_eq!(
        f.engine
            .open_writeback(&remote.id, &file.id, &id())
            .unwrap_err()
            .code,
        libc::EBUSY
    );
    assert_eq!(
        f.engine
            .open_handle(&remote.id, &file.id, true)
            .unwrap_err()
            .code,
        libc::EBUSY
    );
    let mutations = [
        write(&file, b"remote"),
        fenced_write(&file, &legacy, b"remote"),
        Mutation::Truncate {
            node: file.id.clone(),
            base: file.version.clone(),
            size: 0,
            handle: None,
        },
        Mutation::SetAttr {
            node: file.id.clone(),
            base: file.version.clone(),
            mode: Some(0o600),
            mtime_ms: None,
            handle: None,
        },
    ];
    for mutation in mutations {
        assert_eq!(
            f.engine
                .mutate(&remote.id, remote.request_id(), mutation)
                .unwrap_err()
                .code,
            libc::EBUSY
        );
    }
    f.write(&other, b"independent");
    let updated = f
        .apply(fenced_write(&file, &first.handle, b"first"))
        .node
        .unwrap();
    assert_eq!(
        f.engine
            .read(&remote.id, &file.id, None, 0, 5, None)
            .unwrap(),
        b"first"
    );
    f.engine.close_handle(&f.admin.id, &first.handle).unwrap();
    assert_eq!(
        f.engine
            .mutate(&remote.id, remote.request_id(), write(&updated, b"remote"))
            .unwrap_err()
            .code,
        libc::EBUSY
    );
    let updated = f
        .apply(fenced_write(&updated, &second.handle, b"second"))
        .node
        .unwrap();
    assert!(
        f.engine
            .renew_writeback(&f.admin.id, &second.handle)
            .unwrap()
            .expires_ms
            >= second.lease.expires_ms
    );
    f.engine.close_handle(&f.admin.id, &second.handle).unwrap();
    f.engine
        .mutate(&remote.id, remote.request_id(), write(&updated, b"remote"))
        .unwrap();
    assert_eq!(
        f.engine
            .read(&f.admin.id, &file.id, None, 0, 6, None)
            .unwrap(),
        b"remote"
    );
}

#[test]
fn expired_generations_cannot_publish_renew_or_release_their_replacement() {
    let f = Fixture::with_limits(Limits {
        writer_lease_ms: 1000,
        ..Limits::default()
    });
    let file = f.create(&f.root, "file", Kind::File);
    let old = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &id())
        .unwrap();
    let mutation = fenced_write(&file, &old.handle, b"before");
    let request = f.admin.request_id();
    let updated = f
        .engine
        .mutate(&f.admin.id, request.clone(), mutation.clone())
        .unwrap()
        .node
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(
        old.lease.expires_ms.saturating_sub(now_ms()) + 10,
    ));
    let replacement = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &id())
        .unwrap();
    assert_ne!(old.lease.generation, replacement.lease.generation);
    assert_ne!(old.handle, replacement.handle);
    assert_eq!(
        f.engine
            .renew_writeback(&f.admin.id, &old.handle)
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    let before = f.engine.metrics(&f.admin.id).unwrap().published;
    assert_eq!(
        f.engine
            .mutate(
                &f.admin.id,
                f.admin.request_id(),
                fenced_write(&updated, &old.handle, b"stale")
            )
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, request, mutation)
            .unwrap()
            .node
            .unwrap()
            .version,
        updated.version
    );
    assert_eq!(f.engine.metrics(&f.admin.id).unwrap().published, before);
    f.engine.close_handle(&f.admin.id, &old.handle).unwrap();
    f.engine
        .renew_writeback(&f.admin.id, &replacement.handle)
        .unwrap();
    f.apply(fenced_write(&updated, &replacement.handle, b"current"));
    assert_eq!(
        f.engine
            .read(&f.admin.id, &file.id, None, 0, 7, None)
            .unwrap(),
        b"current"
    );
}

#[test]
fn fenced_publication_and_renewal_enforce_current_read_and_write_authority() {
    let f = Fixture::new();
    let file = f.create(&f.root, "file", Kind::File);
    f.grant(&file.id, "alice", WRITE);
    assert_eq!(
        f.engine
            .open_writeback(&f.alice.id, &file.id, &id())
            .unwrap_err()
            .code,
        libc::EACCES
    );
    let (direct, _) = f.engine.open_handle(&f.alice.id, &file.id, true).unwrap();
    let updated = f
        .engine
        .mutate(
            &f.alice.id,
            f.alice.request_id(),
            fenced_write(&file, &direct, b"direct"),
        )
        .unwrap()
        .node
        .unwrap();
    f.grant(&file.id, "alice", READ | WRITE);
    let writer = f
        .engine
        .open_writeback(&f.alice.id, &file.id, &id())
        .unwrap();
    assert_eq!(
        f.engine
            .renew_writeback(&f.bob.id, &writer.handle)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    for permissions in [READ, WRITE] {
        f.grant(&file.id, "alice", permissions);
        assert_eq!(
            f.engine
                .renew_writeback(&f.alice.id, &writer.handle)
                .unwrap_err()
                .code,
            libc::EACCES
        );
        assert_eq!(
            f.engine
                .mutate(
                    &f.alice.id,
                    f.alice.request_id(),
                    fenced_write(&updated, &writer.handle, b"denied")
                )
                .unwrap_err()
                .code,
            libc::EACCES
        );
    }
    f.engine.logout(&f.alice.id);
    let replacement = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &id())
        .unwrap();
    assert_ne!(writer.lease.generation, replacement.lease.generation);
    assert_eq!(
        f.engine
            .renew_writeback(&f.alice.id, &writer.handle)
            .unwrap_err()
            .code,
        libc::ESTALE
    );
}

#[test]
fn writer_open_retries_do_not_consume_handle_capacity() {
    let f = Fixture::with_limits(Limits {
        max_handles: 1,
        ..Limits::default()
    });
    let file = f.create(&f.root, "file", Kind::File);
    let request = id();
    let first = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &request)
        .unwrap();
    assert_eq!(
        f.engine
            .open_writeback(&f.admin.id, &file.id, &request)
            .unwrap()
            .handle,
        first.handle
    );
    assert_eq!(
        f.engine
            .open_writeback(&f.admin.id, &file.id, &id())
            .unwrap_err()
            .code,
        libc::EMFILE
    );
    f.engine.close_handle(&f.admin.id, &first.handle).unwrap();
    let replacement = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &request)
        .unwrap();
    assert_ne!(replacement.handle, first.handle);
    assert_ne!(replacement.lease.generation, first.lease.generation);
}

#[test]
fn restart_retires_writer_handles_and_preserves_only_published_retry_outcomes() {
    let f = Fixture::new();
    let file = f.create(&f.root, "file", Kind::File);
    let writer = f
        .engine
        .open_writeback(&f.admin.id, &file.id, &id())
        .unwrap();
    let mutation = fenced_write(&file, &writer.handle, b"persisted");
    let request = f.admin.request_id();
    let published = f
        .engine
        .mutate(&f.admin.id, request.clone(), mutation.clone())
        .unwrap()
        .node
        .unwrap();
    f.engine.persist().unwrap();
    let Fixture {
        dir, engine, admin, ..
    } = f;
    drop(engine);
    let engine = Engine::open(dir.path(), credentials(), Limits::default()).unwrap();
    let session = engine.login("admin").unwrap();
    assert_eq!(
        engine
            .mutate(
                &admin.id,
                admin.request_id(),
                fenced_write(&published, &writer.handle, b"stale")
            )
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    assert_eq!(
        engine
            .mutate(
                &session.id,
                session.request_id(),
                fenced_write(&published, &writer.handle, b"stale")
            )
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    let replacement = engine.open_writeback(&session.id, &file.id, &id()).unwrap();
    assert_ne!(replacement.lease.generation, writer.lease.generation);
    let before = engine.metrics(&session.id).unwrap().published;
    assert_eq!(
        engine
            .mutate(&session.id, request, mutation)
            .unwrap()
            .node
            .unwrap()
            .version,
        published.version
    );
    assert_eq!(engine.metrics(&session.id).unwrap().published, before);
    engine.close_handle(&session.id, &writer.handle).unwrap();
    engine
        .renew_writeback(&session.id, &replacement.handle)
        .unwrap();
    engine
        .mutate(
            &session.id,
            session.request_id(),
            fenced_write(&published, &replacement.handle, b"new owner"),
        )
        .unwrap();
    assert_eq!(
        engine
            .read(&session.id, &file.id, None, 0, 9, None)
            .unwrap(),
        b"new owner"
    );
}
