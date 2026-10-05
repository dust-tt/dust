use dfs_poc::engine::{Engine, Limits, token_hash};
use dfs_poc::model::*;
use std::sync::{Arc, Barrier};
use tempfile::TempDir;

#[path = "core/rename.rs"]
mod rename_cases;

#[path = "core/publication.rs"]
mod publication_cases;
#[path = "core/writer_leases.rs"]
mod writer_lease_cases;

struct Fixture {
    dir: TempDir,
    engine: Arc<Engine>,
    admin: Session,
    alice: Session,
    bob: Session,
    root: Id,
}
fn credentials() -> Vec<Credential> {
    ["admin", "alice", "bob"]
        .map(|subject| Credential {
            token_hash: token_hash(subject),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: subject.into(),
            principal: subject.into(),
            admin: subject == "admin",
            scope: None,
            expires_ms: u64::MAX,
        })
        .to_vec()
}
impl Fixture {
    fn with_limits(limits: Limits) -> Self {
        let dir = scratch();
        let engine = Arc::new(Engine::open(dir.path(), credentials(), limits).unwrap());
        let admin = engine.login("admin").unwrap();
        let alice = engine.login("alice").unwrap();
        let bob = engine.login("bob").unwrap();
        let root = engine.view(&admin.id).unwrap().nodes[0].node.id.clone();
        Self {
            dir,
            engine,
            admin,
            alice,
            bob,
            root,
        }
    }
    fn new() -> Self {
        Self::with_limits(Limits::default())
    }
    fn apply(&self, mutation: Mutation) -> Outcome {
        self.engine
            .mutate(&self.admin.id, self.admin.request_id(), mutation)
            .unwrap()
    }
    fn create(&self, parent: &str, name: &str, kind: Kind) -> Node {
        self.apply(Mutation::Create {
            parent: parent.into(),
            name: name.into(),
            kind,
            mode: 0o755,
        })
        .node
        .unwrap()
    }
    fn grant(&self, node: &str, subject: &str, verbs: u16) {
        self.apply(Mutation::Grant {
            node: node.into(),
            subject: subject.into(),
            verbs,
        });
    }
    fn write(&self, node: &Node, bytes: &[u8]) -> Node {
        self.apply(write(node, bytes)).node.unwrap()
    }
}
fn write(node: &Node, bytes: &[u8]) -> Mutation {
    Mutation::Write {
        node: node.id.clone(),
        base: node.version.clone(),
        offset: 0,
        data: bytes.to_vec(),
        append: false,
        handle: None,
    }
}

#[test]
fn same_base_writers_conflict_and_other_file_proceeds() {
    let f = Fixture::new();
    let node = f.create(&f.root, "file", Kind::File);
    let other = f.create(&f.root, "other", Kind::File);
    let barrier = Arc::new(Barrier::new(3));
    let threads: Vec<_> = (0..2)
        .map(|i| {
            let engine = f.engine.clone();
            let session = f.admin.clone();
            let node = node.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                engine.mutate(&session.id, session.request_id(), write(&node, &[i]))
            })
        })
        .collect();
    barrier.wait();
    let results: Vec<_> = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|r| r.as_ref().is_err_and(|e| e.code == libc::ESTALE))
            .count(),
        1
    );
    f.write(&other, b"independent");
    f.engine.validate("tenant").unwrap();
}

#[test]
fn ranges_sparse_truncate_append_and_retained_versions() {
    let f = Fixture::new();
    let node = f.create(&f.root, "file", Kind::File);
    let original = f.write(&node, &vec![7; CHUNK_BYTES + 10]);
    let truncated = f
        .apply(Mutation::Truncate {
            node: original.id.clone(),
            base: original.version.clone(),
            size: 4,
            handle: None,
        })
        .node
        .unwrap();
    let extended = f
        .apply(Mutation::Truncate {
            node: truncated.id.clone(),
            base: truncated.version.clone(),
            size: 32,
            handle: None,
        })
        .node
        .unwrap();
    assert_eq!(
        f.engine
            .read(&f.admin.id, &node.id, None, 0, 32, None)
            .unwrap(),
        [vec![7; 4], vec![0; 28]].concat()
    );
    let appended = f
        .apply(Mutation::Write {
            node: node.id.clone(),
            base: extended.version,
            offset: 0,
            data: b"tail".to_vec(),
            append: true,
            handle: None,
        })
        .node
        .unwrap();
    assert_eq!(appended.size, 36);
    assert_eq!(
        f.engine
            .read(&f.admin.id, &node.id, None, 32, 4, None)
            .unwrap(),
        b"tail"
    );
    assert_eq!(
        f.engine
            .read(
                &f.admin.id,
                &node.id,
                Some(&original.version),
                CHUNK_BYTES as u64,
                10,
                None
            )
            .unwrap(),
        vec![7; 10]
    );
    f.engine.validate("tenant").unwrap();
}

#[test]
fn shared_view_groups_overlaps_revocation_and_no_siblings() {
    let f = Fixture::new();
    let hidden = f.create(&f.root, "hidden", Kind::Directory);
    let file = f.create(&hidden.id, "same", Kind::File);
    let file = f.write(&file, b"secret");
    f.create(&hidden.id, "sibling", Kind::File);
    let second = f.create(&f.root, "same", Kind::File);
    f.grant(&file.id, "alice", READ | WRITE);
    f.grant(&second.id, "alice", READ);
    let view = f.engine.view(&f.alice.id).unwrap();
    assert_eq!(view.nodes.len(), 2);
    for entry in &view.nodes {
        assert!(entry.visible_parent.is_none());
        assert!(entry.node.parent.is_none());
        assert!(entry.visible_name.starts_with("same~"));
    }
    assert_ne!(view.nodes[0].visible_name, view.nodes[1].visible_name);
    assert_eq!(
        f.engine
            .read(&f.bob.id, &file.id, None, 0, 100, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    f.grant(&hidden.id, "group", ALL);
    f.apply(Mutation::Member {
        group: "group".into(),
        principal: "alice".into(),
        present: true,
    });
    let view = f.engine.view(&f.alice.id).unwrap();
    assert_eq!(
        view.nodes
            .iter()
            .filter(|n| n.visible_parent.is_none())
            .count(),
        2
    );
    assert!(
        view.nodes
            .iter()
            .any(|n| n.visible_parent.as_deref() == Some(&hidden.id))
    );
    f.grant(&file.id, "alice", 0);
    assert!(
        f.engine
            .read(&f.alice.id, &file.id, None, 0, 100, None)
            .is_ok()
    );
    f.apply(Mutation::Member {
        group: "group".into(),
        principal: "alice".into(),
        present: false,
    });
    assert_eq!(
        f.engine
            .read(&f.alice.id, &file.id, Some(&file.version), 0, 100, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(f.engine.view(&f.alice.id).unwrap().nodes.len(), 1);
    f.engine.validate("tenant").unwrap();
}

#[test]
fn rename_replacement_preserves_identity_not_destination_grants() {
    let f = Fixture::new();
    let a = f.create(&f.root, "a", Kind::Directory);
    let b = f.create(&f.root, "b", Kind::Directory);
    let source = f.create(&a.id, "source", Kind::File);
    let source = f.write(&source, b"new");
    let dest = f.create(&b.id, "dest", Kind::File);
    let dest = f.write(&dest, b"old");
    f.grant(&a.id, "alice", ALL);
    f.grant(&b.id, "bob", ALL);
    f.grant(&source.id, "alice", READ);
    f.grant(&dest.id, "alice", READ);
    let (handle, _) = f.engine.open_handle(&f.alice.id, &dest.id, false).unwrap();
    let source_entry = f.engine.lookup(&f.admin.id, &a.id, "source").unwrap().1;
    let dest_entry = f.engine.lookup(&f.admin.id, &b.id, "dest").unwrap().1;
    let mutation = Mutation::Rename {
        parent: a.id,
        name: "source".into(),
        expected: source_entry.token,
        new_parent: b.id.clone(),
        new_name: "dest".into(),
        destination: Some(dest_entry.token),
    };
    assert_eq!(
        f.engine
            .mutate(&f.alice.id, f.alice.request_id(), mutation.clone())
            .unwrap_err()
            .code,
        libc::EACCES
    );
    f.apply(mutation);
    assert_eq!(
        f.engine.lookup(&f.admin.id, &b.id, "dest").unwrap().0.id,
        source.id
    );
    assert_eq!(
        f.engine
            .read(&f.bob.id, &source.id, None, 0, 100, None)
            .unwrap(),
        b"new"
    );
    assert_eq!(
        f.engine
            .read(&f.alice.id, &dest.id, None, 0, 100, Some(&handle))
            .unwrap(),
        b"old"
    );
    assert_eq!(
        f.engine
            .read(&f.alice.id, &dest.id, None, 0, 100, None)
            .unwrap_err()
            .code,
        libc::ENOENT
    );
    f.grant(&source.id, "alice", 0);
    assert_eq!(
        f.engine
            .read(&f.alice.id, &source.id, None, 0, 100, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    f.engine.validate("tenant").unwrap();
}

#[test]
fn retry_binding_restart_outcome_and_old_handles() {
    let f = Fixture::new();
    let node = f.create(&f.root, "file", Kind::File);
    let request = f.admin.request_id();
    let absent = f.admin.request_id();
    let mutation = write(&node, b"one");
    let outcome = f
        .engine
        .mutate(&f.admin.id, request.clone(), mutation.clone())
        .unwrap();
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, request.clone(), mutation.clone())
            .unwrap()
            .head,
        outcome.head
    );
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, request.clone(), write(&node, b"two"))
            .unwrap_err()
            .code,
        libc::EINVAL
    );
    let old_session = f.admin.id.clone();
    let (handle, _) = f.engine.open_handle(&old_session, &node.id, true).unwrap();
    f.engine.drain().unwrap();
    let path = f.dir.path().to_owned();
    drop(f.engine);
    let reopened = Engine::open(path, credentials(), Limits::default()).unwrap();
    assert_eq!(
        reopened
            .read(&old_session, &node.id, None, 0, 10, Some(&handle))
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    let new_session = reopened.login("admin").unwrap();
    assert_eq!(
        reopened
            .mutate(&new_session.id, request, mutation.clone())
            .unwrap()
            .head,
        outcome.head
    );
    assert_eq!(
        reopened
            .mutate(&new_session.id, absent, mutation)
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    assert_eq!(
        reopened
            .read(&new_session.id, &node.id, None, 0, 10, None)
            .unwrap(),
        b"one"
    );
}

#[test]
fn snapshot_working_bytes_reject_large_views_without_blocking_point_operations() {
    let f = Fixture::with_limits(Limits {
        snapshot_bytes: 8 << 10,
        ..Limits::default()
    });
    let file = f.create(&f.root, "kept", Kind::File);
    let file = f.write(&file, b"readable");
    assert_eq!(f.engine.view(&f.admin.id).unwrap().nodes.len(), 2);
    let extras: Vec<_> = (0..3)
        .map(|index| f.create(&f.root, &format!("extra-{index}"), Kind::File))
        .collect();
    assert_eq!(
        f.engine.view(&f.admin.id).unwrap_err().code,
        libc::EOVERFLOW
    );
    assert_eq!(
        f.engine
            .read(&f.admin.id, &file.id, None, 0, 8, None)
            .unwrap(),
        b"readable"
    );
    for node in extras {
        f.apply(Mutation::Unlink {
            parent: f.root.clone(),
            name: node.name,
            expected: node.entry_token,
            directory: false,
        });
    }
    assert_eq!(f.engine.view(&f.admin.id).unwrap().nodes.len(), 2);
}

#[test]
fn quotas_backpressure_and_persistence_errors_do_not_publish() {
    let f = Fixture::with_limits(Limits {
        pending_bytes: 1,
        ..Limits::default()
    });
    f.create(&f.root, "first", Kind::File);
    let mutation = Mutation::Create {
        parent: f.root.clone(),
        name: "second".into(),
        kind: Kind::File,
        mode: 0o600,
    };
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, f.admin.request_id(), mutation.clone())
            .unwrap_err()
            .code,
        libc::EAGAIN
    );
    let metrics = f.engine.metrics(&f.admin.id).unwrap();
    assert_eq!(metrics.persisted, 0);
    assert_eq!(metrics.published, 1);
    f.engine.persist().unwrap();
    f.apply(mutation.clone());
    f.engine
        .fail_sync
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(f.engine.persist().unwrap_err().code, libc::EIO);
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, f.admin.request_id(), mutation)
            .unwrap_err()
            .code,
        libc::EIO
    );
    f.engine.validate("tenant").unwrap();
    let f = Fixture::with_limits(Limits {
        tenant_bytes: 1,
        ..Limits::default()
    });
    let mutation = Mutation::Create {
        parent: f.root.clone(),
        name: "no".into(),
        kind: Kind::File,
        mode: 0o600,
    };
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, f.admin.request_id(), mutation)
            .unwrap_err()
            .code,
        libc::EDQUOT
    );
    assert_eq!(f.engine.head(&f.admin.id).unwrap().0, 0);
}

#[test]
fn reopen_and_temp_replacement_demonstrate_cas_limits() {
    let f = Fixture::new();
    let old = f.create(&f.root, "file", Kind::File);
    let changed = f.write(&old, b"competing");
    assert_eq!(
        f.engine
            .mutate(&f.admin.id, f.admin.request_id(), write(&old, b"stale"))
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    let (_, reopened) = f.engine.open_handle(&f.admin.id, &old.id, true).unwrap();
    assert_eq!(reopened.version, changed.version);
    f.write(&reopened, b"old editor bytes");
    let temporary = f.create(&f.root, "tmp", Kind::File);
    let entry = f.engine.lookup(&f.admin.id, &f.root, "tmp").unwrap().1;
    let destination = f.engine.lookup(&f.admin.id, &f.root, "file").unwrap().1;
    f.apply(Mutation::Rename {
        parent: f.root.clone(),
        name: "tmp".into(),
        expected: entry.token,
        new_parent: f.root.clone(),
        new_name: "file".into(),
        destination: Some(destination.token),
    });
    assert_eq!(
        f.engine.lookup(&f.admin.id, &f.root, "file").unwrap().0.id,
        temporary.id
    );
}

#[test]
fn journal_deltas_filter_hidden_ancestry_and_reset_policy_changes() {
    let f = Fixture::new();
    let parent = f.create(&f.root, "private", Kind::Directory);
    let node = f.create(&parent.id, "file", Kind::File);
    f.grant(&node.id, "alice", READ | WRITE);
    let view = f.engine.view(&f.alice.id).unwrap();
    let cursor = Cursor {
        incarnation: view.incarnation.clone(),
        head: view.head,
    };
    let updated = f.write(&node, b"update");
    let delta = f.engine.changes(&f.alice.id, cursor.clone()).unwrap();
    assert!(!delta.reset);
    assert_eq!(delta.upserts.len(), 1);
    assert_eq!(delta.upserts[0].node.id, updated.id);
    assert!(delta.upserts[0].node.parent.is_none());
    assert!(
        f.engine
            .stat(&f.alice.id, &node.id, None)
            .unwrap()
            .parent
            .is_none()
    );
    let mut cache = dfs_poc::cache::Cache::new(view, 1024).unwrap();
    cache.namespace.apply_delta(delta).unwrap();
    assert_eq!(
        cache.namespace.nodes[&node.id].node.version,
        updated.version
    );
    f.grant(&node.id, "alice", 0);
    assert!(f.engine.changes(&f.alice.id, cursor).unwrap().reset);
    let invalid = Cursor {
        incarnation: id(),
        head: 0,
    };
    assert_eq!(
        f.engine.changes(&f.admin.id, invalid).unwrap_err().code,
        libc::ESTALE
    );
    let invalid = Cursor {
        incarnation: f.engine.incarnation.clone(),
        head: u64::MAX,
    };
    assert_eq!(
        f.engine.changes(&f.admin.id, invalid).unwrap_err().code,
        libc::ESTALE
    );
}

#[test]
fn subtree_moves_change_inheritance_and_require_grant_administration() {
    let f = Fixture::new();
    let left = f.create(&f.root, "left", Kind::Directory);
    let right = f.create(&f.root, "right", Kind::Directory);
    let directory = f.create(&left.id, "subtree", Kind::Directory);
    let child = f.create(&directory.id, "child", Kind::File);
    f.grant(&left.id, "alice", READ | LIST | TRAVERSE | RENAME | DELETE);
    f.grant(&right.id, "alice", TRAVERSE | RENAME | CREATE);
    f.grant(&right.id, "bob", READ | LIST | TRAVERSE);
    let entry = f.engine.lookup(&f.admin.id, &left.id, "subtree").unwrap().1;
    let mutation = Mutation::Rename {
        parent: left.id,
        name: "subtree".into(),
        expected: entry.token,
        new_parent: right.id,
        new_name: "subtree".into(),
        destination: None,
    };
    assert_eq!(
        f.engine
            .mutate(&f.alice.id, f.alice.request_id(), mutation.clone())
            .unwrap_err()
            .code,
        libc::EACCES
    );
    f.apply(mutation);
    assert_eq!(
        f.engine
            .read(&f.alice.id, &child.id, None, 0, 10, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert!(
        f.engine
            .read(&f.bob.id, &child.id, None, 0, 10, None)
            .is_ok()
    );
    f.engine.validate("tenant").unwrap();
}

#[test]
fn scope_tenant_and_epoch_boundaries_cannot_expand_authority() {
    let f = Fixture::new();
    let scope = f.create(&f.root, "scope", Kind::Directory);
    let inside = f.create(&scope.id, "inside", Kind::File);
    let outside = f.create(&f.root, "outside", Kind::File);
    f.grant(&f.root, "alice", ALL);
    f.engine.drain().unwrap();
    let mut configured = credentials();
    let mut scoped = configured[1].clone();
    scoped.token_hash = token_hash("scoped");
    scoped.scope = Some(scope.id.clone());
    configured.push(scoped);
    let mut other = configured[0].clone();
    other.token_hash = token_hash("other");
    other.tenant = "other-tenant".into();
    configured.push(other);
    drop(f.engine);
    let engine = Engine::open(f.dir.path(), configured, Limits::default()).unwrap();
    let scoped = engine.login("scoped").unwrap();
    assert!(
        engine
            .read(&scoped.id, &inside.id, None, 0, 10, None)
            .is_ok()
    );
    assert_eq!(
        engine
            .read(&scoped.id, &outside.id, None, 0, 10, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(engine.view(&scoped.id).unwrap().nodes.len(), 2);
    let candidates = vec![scope.id.clone(), inside.id.clone(), outside.id.clone()];
    let mut expected = engine.view(&scoped.id).unwrap().nodes;
    expected.sort_by(|a, b| a.node.id.cmp(&b.node.id));
    assert_eq!(
        serde_json::to_value(
            engine
                .validate_search(&scoped.id, &candidates)
                .unwrap()
                .nodes
        )
        .unwrap(),
        serde_json::to_value(expected).unwrap()
    );
    let other = engine.login("other").unwrap();
    assert_eq!(
        engine.stat(&other.id, &inside.id, None).unwrap_err().code,
        libc::ENOENT
    );
    let mut expired = scoped.request_id();
    expired.expires_ms = now_ms() - 1;
    assert_eq!(
        engine
            .mutate(&scoped.id, expired, write(&inside, b"replay"))
            .unwrap_err()
            .code,
        libc::ESTALE
    );
}

fn scratch() -> tempfile::TempDir {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("runtime/tests");
    std::fs::create_dir_all(&root).unwrap();
    tempfile::tempdir_in(root).unwrap()
}

#[test]
fn delegation_retained_reads_and_expiry_enforce_current_authority() {
    let f = Fixture::new();
    let file = f.create(&f.root, "file", Kind::File);
    let old = f.apply(write(&file, b"history")).node.unwrap();
    f.apply(write(&old, b"current"));
    f.grant(&file.id, "alice", READ | GRANT);
    assert_eq!(
        f.engine
            .mutate(
                &f.alice.id,
                f.alice.request_id(),
                Mutation::Grant {
                    node: file.id.clone(),
                    subject: "bob".into(),
                    verbs: WRITE,
                }
            )
            .unwrap_err()
            .code,
        libc::EACCES
    );
    f.engine
        .mutate(
            &f.alice.id,
            f.alice.request_id(),
            Mutation::Grant {
                node: file.id.clone(),
                subject: "bob".into(),
                verbs: READ,
            },
        )
        .unwrap();
    assert_eq!(
        f.engine
            .read(&f.bob.id, &file.id, Some(&old.version), 0, 20, None)
            .unwrap(),
        b"history"
    );
    f.grant(&file.id, "bob", 0);
    assert_eq!(
        f.engine
            .read(&f.bob.id, &file.id, Some(&old.version), 0, 20, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    let expiring = Fixture::with_limits(Limits {
        session_ms: 100,
        ..Limits::default()
    });
    std::thread::sleep(std::time::Duration::from_millis(110));
    assert_eq!(
        expiring.engine.head(&expiring.admin.id).unwrap_err().code,
        libc::EACCES
    );
}

#[test]
fn namespace_limits_reject_replacement_and_delta_atomically_and_recover_after_removal() {
    use dfs_poc::cache::{Cache, NamespaceLimits};
    let f = Fixture::new();
    let file = f.create(&f.root, "kept", Kind::File);
    let file = f.write(&file, b"before");
    let view = f.engine.view(&f.admin.id).unwrap();
    let bytes = view.nodes.iter().map(ViewNode::namespace_bytes).sum();
    let mut cache = Cache::with_limits(view, 1024, NamespaceLimits { nodes: 2, bytes }).unwrap();
    cache.content.insert(&file, 0, b"before".to_vec());
    let head = cache.namespace.head;
    let extra = f.create(&f.root, "extra", Kind::File);
    let view = f.engine.view(&f.admin.id).unwrap();
    assert_eq!(
        cache.replace(view.clone()).unwrap_err().code,
        libc::EOVERFLOW
    );
    let delta = f
        .engine
        .changes(
            &f.admin.id,
            Cursor {
                incarnation: cache.namespace.incarnation.clone(),
                head,
            },
        )
        .unwrap();
    assert_eq!(
        cache.namespace.apply_delta(delta).unwrap_err().code,
        libc::EOVERFLOW
    );
    assert_eq!(cache.namespace.head, head);
    assert_eq!(cache.namespace.bytes, bytes);
    assert_eq!(cache.content.chunk(&file, 0).unwrap(), b"before");
    cache.namespace.limits.nodes = 3;
    assert_eq!(cache.replace(view).unwrap_err().code, libc::EOVERFLOW);
    f.apply(Mutation::Unlink {
        parent: f.root.clone(),
        name: extra.name,
        expected: extra.entry_token,
        directory: false,
    });
    cache.replace(f.engine.view(&f.admin.id).unwrap()).unwrap();
    assert!(cache.namespace.head > head);
    assert_eq!(cache.namespace.bytes, bytes);
    assert_eq!(cache.content.chunk(&file, 0).unwrap(), b"before");
}

#[test]
fn prefetch_planning_uses_current_namespace_after_updates_and_removal() {
    let f = Fixture::new();
    let file = f.create(&f.root, "prefetch", Kind::File);
    let file = f.write(&file, b"before");
    let mut cache = dfs_poc::cache::Cache::new(f.engine.view(&f.admin.id).unwrap(), 1024).unwrap();
    let updated = f.write(&file, b"updated");
    cache.namespace.update(updated.clone()).unwrap();
    let ranges = cache.ranges_to_prefetch(1024);
    assert_eq!(ranges.len(), 1);
    assert_eq!(ranges[0].version, updated.version);
    assert_eq!(u64::from(ranges[0].size), updated.size);
    f.apply(Mutation::Unlink {
        parent: f.root.clone(),
        name: "prefetch".into(),
        expected: updated.entry_token,
        directory: false,
    });
    let delta = f
        .engine
        .changes(
            &f.admin.id,
            Cursor {
                incarnation: cache.namespace.incarnation.clone(),
                head: cache.namespace.head,
            },
        )
        .unwrap();
    cache.namespace.apply_delta(delta).unwrap();
    assert!(cache.ranges_to_prefetch(1024).is_empty());
    assert!(
        cache
            .namespace
            .nodes
            .values()
            .all(|item| item.node.id != file.id)
    );
}

#[test]
fn view_refresh_preserves_unaffected_content_and_tracks_projection_changes() {
    let f = Fixture::new();
    let folder = f.create(&f.root, "folder", Kind::Directory);
    let sibling = f.create(&f.root, "sibling", Kind::File);
    let child = f.create(&folder.id, "child", Kind::File);
    f.grant(&f.root, "alice", LIST | TRAVERSE);
    f.grant(&folder.id, "alice", READ | LIST | TRAVERSE);
    f.grant(&sibling.id, "alice", READ);
    let mut cache = dfs_poc::cache::Cache::new(f.engine.view(&f.alice.id).unwrap(), 1024).unwrap();
    cache.content.set_speculative_budget(256);
    cache.content.insert(&child, 0, vec![1; 256]);
    cache.content.insert_speculative(&sibling, 0, vec![2; 256]);
    f.grant(&sibling.id, "bob", READ);
    assert!(
        cache
            .replace(f.engine.view(&f.alice.id).unwrap())
            .unwrap()
            .is_empty()
    );
    assert_eq!(cache.content.bytes, 512);
    assert_eq!(cache.content.speculative_bytes, 256);
    assert_eq!(cache.content.chunk(&child, 0).unwrap(), vec![1; 256]);
    assert_eq!(cache.content.chunk(&sibling, 0).unwrap(), vec![2; 256]);
    f.grant(&child.id, "alice", READ);
    assert!(
        cache
            .replace(f.engine.view(&f.alice.id).unwrap())
            .unwrap()
            .is_empty()
    );
    f.grant(&folder.id, "alice", 0);
    let changed = cache.replace(f.engine.view(&f.alice.id).unwrap()).unwrap();
    assert!(!changed.iter().any(|item| item.node.id == child.id));
    f.grant(&f.root, "alice", 0);
    let changed = cache.replace(f.engine.view(&f.alice.id).unwrap()).unwrap();
    assert!(
        changed.iter().any(
            |item| item.node.id == child.id && item.visible_parent.as_ref() == Some(&folder.id)
        )
    );
    assert!(
        changed
            .iter()
            .any(|item| item.node.id == child.id && item.visible_parent.is_none())
    );
    assert_eq!(cache.content.chunk(&child, 0).unwrap(), vec![1; 256]);
    assert_eq!(cache.content.chunk(&sibling, 0).unwrap(), vec![2; 256]);
    f.grant(&child.id, "alice", 0);
    let changed = cache.replace(f.engine.view(&f.alice.id).unwrap()).unwrap();
    assert!(changed.iter().any(|item| item.node.id == child.id));
    assert!(!changed.iter().any(|item| item.node.id == sibling.id));
    assert!(cache.content.chunk(&child, 0).is_none());
    assert_eq!(cache.content.bytes, 256);
    assert_eq!(cache.content.speculative_bytes, 256);
    assert_eq!(
        cache.content.shared_chunk(&sibling, 0).unwrap().as_ref(),
        vec![2; 256]
    );
    assert_eq!(cache.content.speculative_bytes, 0);
    cache.content.insert(&sibling, 1, vec![3; 512]);
    cache.content.insert(&sibling, 2, vec![4; 512]);
    assert_eq!(cache.content.bytes, 512);
    assert!(cache.content.chunk(&sibling, 0).is_none());
    assert!(cache.content.chunk(&sibling, 1).is_none());
    assert_eq!(cache.content.chunk(&sibling, 2).unwrap(), vec![4; 512]);
}

#[test]
fn view_refresh_discards_replaced_removed_and_old_incarnation_content() {
    let f = Fixture::new();
    let a = f.create(&f.root, "a", Kind::File);
    let b = f.create(&f.root, "b", Kind::File);
    let mut cache = dfs_poc::cache::Cache::new(f.engine.view(&f.admin.id).unwrap(), 1024).unwrap();
    cache.content.set_speculative_budget(256);
    cache.content.insert(&a, 0, vec![1; 256]);
    cache.content.insert_speculative(&b, 0, vec![2; 256]);
    let updated = f.write(&a, b"changed");
    let changed = cache.replace(f.engine.view(&f.admin.id).unwrap()).unwrap();
    assert!(changed.iter().all(|item| item.node.id == a.id));
    assert!(cache.content.chunk(&a, 0).is_none());
    assert!(cache.content.chunk(&updated, 0).is_none());
    assert_eq!(cache.content.bytes, 256);
    f.apply(Mutation::Unlink {
        parent: f.root.clone(),
        name: "b".into(),
        expected: b.entry_token.clone(),
        directory: false,
    });
    cache.replace(f.engine.view(&f.admin.id).unwrap()).unwrap();
    assert_eq!(cache.content.bytes, 0);
    assert_eq!(cache.content.speculative_bytes, 0);
    cache.content.insert(&updated, 0, vec![3; 256]);
    let mut view = f.engine.view(&f.admin.id).unwrap();
    view.incarnation = id();
    cache.replace(view).unwrap();
    assert_eq!(cache.content.bytes, 0);
    assert!(cache.content.chunk(&updated, 0).is_none());
    cache.content.insert(&updated, 0, vec![4; 768]);
    assert_eq!(cache.content.bytes, 768);
}

#[test]
fn index_export_is_persisted_exact_and_privileged() {
    let f = Fixture::new();
    let file = f.create(&f.root, "index.txt", Kind::File);
    let file = f.write(&file, b"persisted text");
    assert!(f.engine.begin_index_snapshot(&f.alice.id, None).is_err());
    let snapshot = f.engine.begin_index_snapshot(&f.admin.id, None).unwrap();
    assert!(snapshot.reset);
    assert_eq!(snapshot.cursor.head, f.engine.head(&f.admin.id).unwrap().0);
    assert_eq!(f.engine.metrics(&f.admin.id).unwrap().pending_bytes, 0);
    let updated = f.write(&file, b"newer version!");
    f.apply(Mutation::Unlink {
        parent: f.root.clone(),
        name: "index.txt".into(),
        expected: updated.entry_token,
        directory: false,
    });
    let expires = f
        .engine
        .renew_index_snapshot(&f.admin.id, &snapshot.lease)
        .unwrap();
    assert!(expires >= snapshot.expires_ms);
    assert!(expires <= now_ms() + 60_000);
    assert_eq!(
        f.engine
            .read_index_content(&f.admin.id, &snapshot.lease, &file.id, 0, 100)
            .unwrap(),
        b"persisted text"
    );
    assert!(
        f.engine
            .read_index_content(&f.alice.id, &snapshot.lease, &file.id, 0, 100)
            .is_err()
    );
    let another = f.engine.login("admin").unwrap();
    assert!(
        f.engine
            .renew_index_snapshot(&another.id, &snapshot.lease)
            .is_err()
    );
    assert!(
        f.engine
            .renew_index_snapshot(&f.alice.id, &snapshot.lease)
            .is_err()
    );
    assert!(
        f.engine
            .list_index_nodes(&another.id, &snapshot.lease, 0)
            .is_err()
    );
    let next = f
        .engine
        .begin_index_snapshot(&f.admin.id, Some(snapshot.cursor))
        .unwrap();
    assert_eq!(next.changes.len(), 2);
    assert!(
        !f.engine
            .list_index_nodes(&f.admin.id, &next.lease, 0)
            .unwrap()
            .iter()
            .any(|node| node.id == file.id)
    );
    f.engine
        .end_index_snapshot(&f.admin.id, &snapshot.lease)
        .unwrap();
    assert!(
        f.engine
            .list_index_nodes(&f.admin.id, &snapshot.lease, 0)
            .is_err()
    );
    f.engine.logout(&f.admin.id);
    assert!(
        f.engine
            .renew_index_snapshot(&f.admin.id, &next.lease)
            .is_err()
    );
    assert!(
        f.engine
            .list_index_nodes(&f.admin.id, &next.lease, 0)
            .is_err()
    );
}

#[test]
fn index_export_rejects_failed_persistence_and_bounds_leases() {
    let f = Fixture::new();
    f.create(&f.root, "pending", Kind::File);
    f.engine
        .fail_sync
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(f.engine.begin_index_snapshot(&f.admin.id, None).is_err());
    f.engine
        .fail_sync
        .store(false, std::sync::atomic::Ordering::SeqCst);
    for _ in 0..4 {
        f.engine.begin_index_snapshot(&f.admin.id, None).unwrap();
    }
    assert_eq!(
        f.engine
            .begin_index_snapshot(&f.admin.id, None)
            .unwrap_err()
            .code,
        libc::EAGAIN
    );
}

#[tokio::test]
async fn index_export_rpc_roundtrips_without_changing_existing_wire_tags() {
    use dfs_poc::{
        rpc::{Service, decode, encode},
        wire::dfs_server::Dfs,
    };
    let f = Fixture::new();
    let service = Service::new(f.engine.clone());
    let response = service
        .call(tonic::Request::new(
            encode(&Envelope {
                session: f.admin.id.clone(),
                call: Call::BeginIndexSnapshot { after: None },
            })
            .unwrap(),
        ))
        .await
        .unwrap();
    let reply: Result<Reply> = decode(response.into_inner()).unwrap();
    let Reply::IndexSnapshot(snapshot) = reply.unwrap() else {
        panic!("expected export")
    };
    assert_eq!(snapshot.tenant, "tenant");
    let response = service
        .call(tonic::Request::new(
            encode(&Envelope {
                session: f.admin.id.clone(),
                call: Call::RenewIndexSnapshot {
                    lease: snapshot.lease.clone(),
                },
            })
            .unwrap(),
        ))
        .await
        .unwrap();
    let reply: Result<Reply> = decode(response.into_inner()).unwrap();
    assert!(
        matches!(reply.unwrap(), Reply::IndexLeaseExpiry(expiry) if expiry >= snapshot.expires_ms)
    );
    let response = service
        .call(tonic::Request::new(
            encode(&Envelope {
                session: f.admin.id.clone(),
                call: Call::ListIndexNodes {
                    lease: snapshot.lease,
                    offset: 0,
                },
            })
            .unwrap(),
        ))
        .await
        .unwrap();
    let reply: Result<Reply> = decode(response.into_inner()).unwrap();
    let Reply::IndexNodes(nodes) = reply.unwrap() else {
        panic!("expected nodes")
    };
    assert_eq!(nodes.len(), 1);
    assert_eq!(
        bincode::serialize(&Call::Barrier).unwrap(),
        12u32.to_le_bytes()
    );
    assert_eq!(
        bincode::serialize(&Reply::Unit).unwrap(),
        2u32.to_le_bytes()
    );
    assert_eq!(
        &bincode::serialize(&Call::RenewIndexSnapshot {
            lease: "lease".into()
        })
        .unwrap()[..4],
        &21u32.to_le_bytes()
    );
    assert_eq!(
        &bincode::serialize(&Reply::IndexLeaseExpiry(0)).unwrap()[..4],
        &17u32.to_le_bytes()
    );
}

#[test]
fn search_validation_matches_view_after_membership_and_grant_changes() {
    let f = Fixture::new();
    let folder = f.create(&f.root, "shared", Kind::Directory);
    let hidden = f.create(&f.root, "hidden", Kind::Directory);
    let detached = f.create(&hidden.id, "direct", Kind::File);
    let mut ids = vec![folder.id.clone(), hidden.id.clone(), detached.id.clone()];
    for index in 0..90 {
        ids.push(
            f.create(&folder.id, &format!("file-{index}"), Kind::File)
                .id,
        );
    }
    f.grant(&folder.id, "team", READ | LIST | TRAVERSE);
    f.grant(&detached.id, "alice", READ);
    for present in [true, false, true] {
        f.apply(Mutation::Member {
            group: "team".into(),
            principal: "alice".into(),
            present,
        });
        for session in [&f.alice, &f.admin, &f.bob] {
            let mut expected = f.engine.view(&session.id).unwrap().nodes;
            expected.retain(|node| ids.contains(&node.node.id));
            expected.sort_by(|a, b| a.node.id.cmp(&b.node.id));
            let actual = f.engine.validate_search(&session.id, &ids).unwrap();
            assert_eq!(
                serde_json::to_value(actual.nodes).unwrap(),
                serde_json::to_value(expected).unwrap()
            );
        }
    }
    f.grant(&folder.id, "team", 0);
    let actual = f.engine.validate_search(&f.alice.id, &ids).unwrap();
    assert_eq!(actual.nodes.len(), 1);
    assert_eq!(actual.nodes[0].node.id, detached.id);
    assert_eq!(actual.nodes[0].visible_parent, None);
}

#[test]
fn published_nodes_support_view_handle_reads_without_bypassing_current_authority() {
    let f = Fixture::new();
    let node = f.create(&f.root, "published-view-pin", Kind::File);
    f.grant(&f.root, "alice", READ | WRITE);
    let node = f
        .engine
        .mutate(
            &f.alice.id,
            f.alice.request_id(),
            write(&node, b"published"),
        )
        .unwrap()
        .node
        .unwrap();
    let handle = format!("view:{}", node.id);
    assert_eq!(
        f.engine
            .read(&f.alice.id, &node.id, None, 0, 32, Some(&handle))
            .unwrap(),
        b"published"
    );
    f.apply(Mutation::Unlink {
        parent: f.root.clone(),
        name: node.name.clone(),
        expected: node.entry_token.clone(),
        directory: false,
    });
    assert_eq!(
        f.engine
            .stat(&f.alice.id, &node.id, Some(&handle))
            .unwrap()
            .size,
        9
    );
    assert_eq!(
        f.engine
            .read(&f.alice.id, &node.id, None, 0, 32, Some(&handle))
            .unwrap(),
        b"published"
    );
    f.grant(&f.root, "alice", WRITE);
    assert_eq!(
        f.engine
            .read(&f.alice.id, &node.id, None, 0, 32, Some(&handle))
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(
        f.engine
            .read(&f.bob.id, &node.id, None, 0, 32, Some(&handle))
            .unwrap_err()
            .code,
        libc::EACCES
    );
}
