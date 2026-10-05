use super::*;
use std::sync::mpsc;
use std::time::Duration;

fn writes_during_persistence(fail: bool) {
    let directory = tempfile::tempdir().unwrap();
    let engine = Engine::open(
        directory.path(),
        vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "admin".into(),
            principal: "admin".into(),
            admin: true,
            scope: None,
            expires_ms: u64::MAX,
        }],
        Limits::default(),
    )
    .unwrap();
    let session = engine.login("admin").unwrap();
    let root = engine.view(&session.id).unwrap().nodes[0].node.id.clone();
    let create = |name: &str| {
        engine.mutate(
            &session.id,
            session.request_id(),
            Mutation::Create {
                parent: root.clone(),
                name: name.into(),
                kind: Kind::File,
                mode: 0o600,
            },
        )
    };
    create("before").unwrap();
    let before = engine.metrics(&session.id).unwrap();
    let (started_tx, started_rx) = mpsc::channel();
    let (resume_tx, resume_rx) = mpsc::channel();
    let (written_tx, written_rx) = mpsc::channel();
    std::thread::scope(|scope| {
        let engine = &engine;
        let persistence = scope.spawn(move || {
            engine.persistence_barrier(
                || engine.store.reader(),
                || {
                    started_tx.send(()).unwrap();
                    resume_rx.recv_timeout(Duration::from_secs(10)).unwrap();
                    if fail {
                        Err(err(libc::EIO, "injected flush failure"))
                    } else {
                        engine.store.persist()
                    }
                },
            )
        });
        started_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(engine.persistence.try_lock().is_none());
        let writer = scope.spawn(|| {
            written_tx.send(create("during")).unwrap();
        });
        let written = written_rx.recv_timeout(Duration::from_secs(5));
        let during = engine.metrics(&session.id).unwrap();
        resume_tx.send(()).unwrap();
        writer.join().unwrap();
        let persisted = persistence.join().unwrap();
        written
            .expect("publication blocked on persistence")
            .unwrap();
        assert!(during.pending_bytes > before.pending_bytes);
        assert_eq!(during.published, before.published + 1);
        let after = engine.metrics(&session.id).unwrap();
        if fail {
            assert!(persisted.is_err_and(|error| error.code == libc::EIO));
            assert_eq!(after.persisted, before.persisted);
            assert_eq!(after.pending_bytes, during.pending_bytes);
            assert!(after.storage_error.is_some());
            assert_eq!(create("after").unwrap_err().code, libc::EIO);
        } else {
            let (head, reader) = persisted.unwrap();
            assert_eq!(head, before.published);
            assert_eq!(after.persisted, before.published);
            assert_eq!(after.published, during.published);
            assert_eq!(
                after.pending_bytes,
                during.pending_bytes - before.pending_bytes
            );
            assert!(reader.entry("tenant", &root, "before").unwrap().is_some());
            assert!(reader.entry("tenant", &root, "during").unwrap().is_none());
            assert_eq!(engine.persist().unwrap(), during.published);
            assert_eq!(engine.metrics(&session.id).unwrap().pending_bytes, 0);
        }
    });
    engine.validate("tenant").unwrap();
}

#[test]
fn publication_proceeds_during_flush_and_preserves_snapshot_and_pending_suffix() {
    writes_during_persistence(false);
}

#[test]
fn failed_flush_preserves_pending_suffix_and_stops_subsequent_publication() {
    writes_during_persistence(true);
}

#[test]
fn historical_view_pins_are_bounded_by_retained_nodes_and_cannot_outlive_logout() {
    let directory = tempfile::tempdir().unwrap();
    let engine = Engine::open(
        directory.path(),
        vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "admin".into(),
            principal: "admin".into(),
            admin: true,
            scope: None,
            expires_ms: u64::MAX,
        }],
        Limits {
            max_nodes: 5,
            ..Limits::default()
        },
    )
    .unwrap();
    let session = engine.login("admin").unwrap();
    let root = engine.view(&session.id).unwrap().nodes[0].node.id.clone();
    let mut retained = Vec::new();
    for _ in 1..5 {
        let node = engine
            .mutate(
                &session.id,
                session.request_id(),
                Mutation::Create {
                    parent: root.clone(),
                    name: "reused-name".into(),
                    kind: Kind::File,
                    mode: 0o600,
                },
            )
            .unwrap()
            .node
            .unwrap();
        engine
            .mutate(
                &session.id,
                session.request_id(),
                Mutation::Unlink {
                    parent: root.clone(),
                    name: node.name.clone(),
                    expected: node.entry_token.clone(),
                    directory: false,
                },
            )
            .unwrap();
        retained.push(node);
        assert_eq!(engine.view(&session.id).unwrap().nodes.len(), 1);
    }
    assert_eq!(engine.view_pins.lock()[&session.id].len(), 5);
    let before = engine.head(&session.id).unwrap();
    assert_eq!(
        engine
            .mutate(
                &session.id,
                session.request_id(),
                Mutation::Create {
                    parent: root.clone(),
                    name: "reused-name".into(),
                    kind: Kind::File,
                    mode: 0o600,
                }
            )
            .unwrap_err()
            .code,
        libc::EDQUOT
    );
    assert_eq!(engine.head(&session.id).unwrap(), before);
    for node in &retained {
        assert!(
            engine
                .stat(&session.id, &node.id, Some(&format!("view:{}", node.id)))
                .unwrap()
                .unlinked
        );
    }
    engine.logout(&session.id);
    engine.pin_nodes(&session, retained.iter().map(|node| node.id.clone()));
    assert!(engine.view_pins.lock().is_empty());
    let next = engine.login("admin").unwrap();
    assert_eq!(
        engine
            .stat(
                &next.id,
                &retained[0].id,
                Some(&format!("view:{}", retained[0].id))
            )
            .unwrap_err()
            .code,
        libc::EACCES
    );
    engine
        .sessions
        .write()
        .get_mut(&next.id)
        .unwrap()
        .expires_ms = 0;
    engine.pin_nodes(&next, std::iter::once(root));
    assert!(engine.view_pins.lock().is_empty());
}
