mod support;
use dfs_tikv::engine::{Engine, Limits, token_hash};
use dfs_tikv::model::*;
use dfs_tikv::{Config, Store};
use sha2::{Digest, Sha256};
use std::sync::Arc;

fn credentials() -> Vec<Credential> {
    [("admin", "owner", true), ("reader", "reader", false)]
        .into_iter()
        .map(|(token, principal, admin)| Credential {
            token_hash: token_hash(token),
            tenant: "tenant".to_owned(),
            issuer: "test".to_owned(),
            subject: principal.to_owned(),
            principal: principal.to_owned(),
            admin,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        })
        .collect()
}

async fn engines() -> anyhow::Result<(Arc<Engine>, Arc<Engine>)> {
    let endpoints = std::env::var("DFS_TIKV_TEST_PD").expect("real TiKV endpoints required");
    let config = support::config(Config::new(
        endpoints.split(',').map(str::to_owned).collect(),
        format!("engine-{}", id()),
    ));
    let credentials = credentials();
    let first = Engine::open(
        Store::connect(config.clone()).await?,
        credentials.clone(),
        Limits::default(),
    )
    .await?;
    let second = Engine::open(
        Store::connect(config).await?,
        credentials,
        Limits::default(),
    )
    .await?;
    assert_eq!(first.incarnation, second.incarnation);
    Ok((Arc::new(first), Arc::new(second)))
}

async fn create(
    engine: &Engine,
    session: &Session,
    parent: &str,
    name: &str,
    kind: Kind,
) -> anyhow::Result<Node> {
    Ok(engine
        .mutate(
            &session.id,
            session.request_id(),
            Mutation::Create {
                parent: parent.to_owned(),
                name: name.to_owned(),
                kind,
                mode: 0o755,
            },
        )
        .await?
        .node
        .unwrap())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn sessions_handles_and_logout_cross_frontends() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let session = first.login("admin").await?;
    let root = second.root(&session.id).await?;
    let node = create(&first, &session, &root, "report", Kind::File).await?;
    let (handle, _) = first.open_handle(&session.id, &node.id, true).await?;
    let outcome = second
        .mutate(
            &session.id,
            session.request_id(),
            Mutation::Write {
                node: node.id.clone(),
                base: node.version.clone(),
                offset: 0,
                data: b"cross-pod".to_vec(),
                append: false,
                handle: Some(handle.clone()),
            },
        )
        .await?;
    assert_eq!(
        first
            .read(&session.id, &node.id, None, 0, 64, Some(&handle))
            .await?,
        b"cross-pod"
    );
    let current = outcome.node.unwrap();
    second
        .mutate(
            &session.id,
            session.request_id(),
            Mutation::Unlink {
                parent: root.clone(),
                name: "report".to_owned(),
                expected: current.entry_token,
                directory: false,
            },
        )
        .await?;
    assert_eq!(
        first
            .lookup(&session.id, &root, "report")
            .await
            .unwrap_err()
            .code,
        libc::ENOENT
    );
    assert_eq!(
        first
            .read(&session.id, &node.id, None, 0, 64, Some(&handle))
            .await?,
        b"cross-pod"
    );
    second.close_handle(&session.id, &handle).await?;
    assert_eq!(
        first
            .read(&session.id, &node.id, None, 0, 64, Some(&handle))
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    second.logout(&session.id).await?;
    assert_eq!(
        first.head(&session.id).await.unwrap_err().code,
        libc::ESTALE
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn identical_append_resolves_once_and_rejects_changed_payload() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let session = first.login("admin").await?;
    let root = first.root(&session.id).await?;
    let node = create(&first, &session, &root, "log", Kind::File).await?;
    let request = session.request_id();
    let mutation = Mutation::Write {
        node: node.id.clone(),
        base: node.version.clone(),
        offset: 999,
        data: b"one record\n".to_vec(),
        append: true,
        handle: None,
    };
    let (a, b) = tokio::join!(
        first.mutate(&session.id, request.clone(), mutation.clone()),
        second.mutate(&session.id, request.clone(), mutation.clone())
    );
    let a = a?;
    let b = b?;
    assert_eq!(a.head, b.head);
    assert_eq!(a.node, b.node);
    assert_eq!(
        second
            .read(&session.id, &node.id, None, 0, 64, None)
            .await?,
        b"one record\n"
    );
    assert_eq!(first.head(&session.id).await?.0, 2);
    let mut changed = mutation.clone();
    if let Mutation::Write { data, .. } = &mut changed {
        *data = b"different".to_vec();
    }
    assert_eq!(
        second
            .mutate(&session.id, request.clone(), changed)
            .await
            .unwrap_err()
            .code,
        libc::EINVAL
    );
    let publication = PublicationId {
        tenant: session.tenant.clone(),
        request: request.clone(),
        digest: Sha256::digest(&bincode::serialize(&(&request, &mutation))?).into(),
    };
    let resolved = second
        .resolve_publication(&session.id, publication)
        .await?
        .unwrap();
    assert_eq!(resolved.outcome.head, a.head);
    let confirmation = first
        .persist_through(&session.id, resolved.receipt, DurabilityLevel::Quorum)
        .await?;
    assert_eq!(confirmation.level, DurabilityLevel::Quorum);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn opposing_directory_moves_cannot_form_cycle() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let session = first.login("admin").await?;
    let root = first.root(&session.id).await?;
    let a = create(&first, &session, &root, "a", Kind::Directory).await?;
    let b = create(&second, &session, &root, "b", Kind::Directory).await?;
    let move_a = Mutation::Rename {
        parent: root.clone(),
        name: "a".to_owned(),
        expected: a.entry_token.clone(),
        new_parent: b.id.clone(),
        new_name: "a".to_owned(),
        destination: None,
    };
    let move_b = Mutation::Rename {
        parent: root.clone(),
        name: "b".to_owned(),
        expected: b.entry_token.clone(),
        new_parent: a.id.clone(),
        new_name: "b".to_owned(),
        destination: None,
    };
    let (left, right) = tokio::join!(
        first.mutate(&session.id, session.request_id(), move_a),
        second.mutate(&session.id, session.request_id(), move_b)
    );
    assert_ne!(left.is_ok(), right.is_ok());
    let failure = left.err().or(right.err()).unwrap();
    assert_eq!(failure.code, libc::EINVAL);
    let current_a = first.stat(&session.id, &a.id, None).await?;
    let current_b = second.stat(&session.id, &b.id, None).await?;
    assert!(!(current_a.parent == Some(b.id) && current_b.parent == Some(a.id)));
    assert_eq!(first.head(&session.id).await?.0, 3);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn cached_history_and_handles_do_not_bypass_group_revocation() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let admin = first.login("admin").await?;
    let reader = second.login("reader").await?;
    let root = first.root(&admin.id).await?;
    let file = create(&first, &admin, &root, "secret", Kind::File).await?;
    let updated = first
        .mutate(
            &admin.id,
            admin.request_id(),
            Mutation::Write {
                node: file.id.clone(),
                base: file.version,
                offset: 0,
                data: b"private".to_vec(),
                append: false,
                handle: None,
            },
        )
        .await?
        .node
        .unwrap();
    first
        .mutate(
            &admin.id,
            admin.request_id(),
            Mutation::Grant {
                node: root.clone(),
                subject: "team".to_owned(),
                verbs: READ | LIST | TRAVERSE,
            },
        )
        .await?;
    first
        .mutate(
            &admin.id,
            admin.request_id(),
            Mutation::Member {
                group: "team".to_owned(),
                principal: "reader".to_owned(),
                present: true,
            },
        )
        .await?;
    let (handle, _) = first.open_handle(&reader.id, &updated.id, false).await?;
    assert_eq!(
        second
            .read(
                &reader.id,
                &updated.id,
                Some(&updated.version),
                0,
                64,
                Some(&handle)
            )
            .await?,
        b"private"
    );
    second
        .mutate(
            &admin.id,
            admin.request_id(),
            Mutation::Member {
                group: "team".to_owned(),
                principal: "reader".to_owned(),
                present: false,
            },
        )
        .await?;
    assert_eq!(
        first
            .read(
                &reader.id,
                &updated.id,
                Some(&updated.version),
                0,
                64,
                Some(&handle)
            )
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(
        second
            .stat(&reader.id, &updated.id, Some(&handle))
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn chunk_boundaries_holes_and_stale_base_are_preserved() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let session = first.login("admin").await?;
    let root = first.root(&session.id).await?;
    let node = create(&first, &session, &root, "data", Kind::File).await?;
    let mutation = Mutation::Write {
        node: node.id.clone(),
        base: node.version,
        offset: (CHUNK_BYTES - 2) as u64,
        data: b"abcdef".to_vec(),
        append: false,
        handle: None,
    };
    let outcome = second
        .mutate(&session.id, session.request_id(), mutation.clone())
        .await?
        .node
        .unwrap();
    assert_eq!(
        first
            .read(
                &session.id,
                &node.id,
                None,
                (CHUNK_BYTES - 4) as u64,
                16,
                None
            )
            .await?,
        b"\0\0abcdef"
    );
    assert_eq!(
        first
            .mutate(&session.id, session.request_id(), mutation)
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    let truncated = first
        .mutate(
            &session.id,
            session.request_id(),
            Mutation::Truncate {
                node: node.id.clone(),
                base: outcome.version.clone(),
                size: (CHUNK_BYTES + 1) as u64,
                handle: None,
            },
        )
        .await?
        .node
        .unwrap();
    second
        .mutate(
            &session.id,
            session.request_id(),
            Mutation::Truncate {
                node: node.id.clone(),
                base: truncated.version,
                size: (CHUNK_BYTES + 4) as u64,
                handle: None,
            },
        )
        .await?;
    assert_eq!(
        first
            .read(
                &session.id,
                &node.id,
                None,
                (CHUNK_BYTES - 2) as u64,
                10,
                None
            )
            .await?,
        b"abc\0\0\0"
    );
    assert_eq!(
        second
            .read(
                &session.id,
                &node.id,
                Some(&outcome.version),
                (CHUNK_BYTES - 2) as u64,
                10,
                None
            )
            .await?,
        b"abcdef"
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn view_pins_fence_writes_by_version_session_and_current_authority() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let admin = first.login("admin").await?;
    let reader = second.login("reader").await?;
    let foreign = first.login("reader").await?;
    let root = first.root(&admin.id).await?;
    let node = create(&first, &admin, &root, "pinned", Kind::File).await?;
    first
        .mutate(
            &admin.id,
            admin.request_id(),
            Mutation::Grant {
                node: root.clone(),
                subject: "reader".into(),
                verbs: READ | WRITE | LIST | TRAVERSE,
            },
        )
        .await?;
    first.view(&reader.id).await?;
    let pin = format!("view:{}", node.id);
    let mutation = Mutation::Write {
        node: node.id.clone(),
        base: node.version.clone(),
        offset: 0,
        data: b"published".to_vec(),
        append: false,
        handle: Some(pin.clone()),
    };
    assert_eq!(
        second
            .mutate(&foreign.id, foreign.request_id(), mutation.clone())
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    let current = second
        .mutate(&reader.id, reader.request_id(), mutation.clone())
        .await?
        .node
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    assert_eq!(
        first
            .mutate(&reader.id, reader.request_id(), mutation)
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    first
        .mutate(
            &admin.id,
            admin.request_id(),
            Mutation::Grant {
                node: root,
                subject: "reader".into(),
                verbs: READ | LIST | TRAVERSE,
            },
        )
        .await?;
    assert_eq!(
        second
            .mutate(
                &reader.id,
                reader.request_id(),
                Mutation::Truncate {
                    node: current.id.clone(),
                    base: current.version,
                    size: 0,
                    handle: Some(pin.clone()),
                }
            )
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(
        first
            .read(&reader.id, &current.id, None, 0, 64, Some(&pin))
            .await?,
        b"published"
    );
    first.logout(&reader.id).await?;
    assert_eq!(
        second
            .stat(&reader.id, &current.id, Some(&pin))
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn concurrent_logins_respect_shared_session_capacity() -> anyhow::Result<()> {
    let endpoints = std::env::var("DFS_TIKV_TEST_PD")?;
    let config = support::config(Config::new(
        endpoints.split(',').map(str::to_owned).collect(),
        format!("session-limit-{}", id()),
    ));
    let limits = Limits {
        max_sessions: 1,
        ..Limits::default()
    };
    let credentials = credentials();
    let first = Engine::open(
        Store::connect(config.clone()).await?,
        credentials.clone(),
        limits.clone(),
    )
    .await?;
    let second = Engine::open(Store::connect(config).await?, credentials, limits).await?;
    for _ in 0..8 {
        let (a, b) = tokio::join!(first.login("admin"), second.login("admin"));
        assert_ne!(a.is_ok(), b.is_ok());
        for result in [&a, &b] {
            if let Err(error) = result {
                assert_eq!(error.code, libc::EAGAIN);
            }
        }
        let session = a.or(b)?;
        second.logout(&session.id).await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn warm_key_hints_do_not_cache_credential_authority() -> anyhow::Result<()> {
    let (first, second) = engines().await?;
    let session = first.login("admin").await?;
    let observer = second.login("reader").await?;
    let root = first.root(&session.id).await?;
    first.session(&session.id).await?;
    first.session(&session.id).await?;
    let before = second.head(&observer.id).await?.0;
    let mut batch = second.store.snapshot("tenant").await?.batch();
    let mut key = b"credential\0\0".to_vec();
    key.extend(token_hash("admin").as_bytes());
    key.extend([0, 0]);
    batch.delete(&key).await?;
    assert!(matches!(
        batch.commit().await?,
        dfs_tikv::Commit::Published { .. }
    ));
    assert_eq!(
        first.session(&session.id).await.unwrap_err().code,
        libc::EACCES
    );
    assert_eq!(
        first
            .mutate(
                &session.id,
                session.request_id(),
                Mutation::Create {
                    parent: root,
                    name: "revoked-key-hint".into(),
                    kind: Kind::File,
                    mode: 0o600,
                }
            )
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(second.head(&observer.id).await?.0, before);
    Ok(())
}
