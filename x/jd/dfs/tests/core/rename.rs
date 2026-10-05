use super::*;

fn movement(node: &Node, parent: &str, name: &str, destination: Option<Id>) -> Mutation {
    Mutation::Rename {
        parent: node.parent.clone().unwrap(),
        name: node.name.clone(),
        expected: node.entry_token.clone(),
        new_parent: parent.into(),
        new_name: name.into(),
        destination,
    }
}

#[test]
fn deep_trees_preserve_moves_content_authority_and_recovery() {
    let f = Fixture::new();
    let subtree = f.create(&f.root, "subtree", Kind::Directory);
    let leaf = f.write(&f.create(&subtree.id, "leaf", Kind::File), b"deep content");
    let mut parent = f.root.clone();
    for index in 0..256 {
        parent = f.create(&parent, &format!("d-{index}"), Kind::Directory).id;
    }
    let peer = f.create(&parent, "peer", Kind::Directory);
    let file = f.create(&parent, "created-deep", Kind::File);
    f.grant(&parent, "alice", READ | LIST | TRAVERSE);
    let mut moved = subtree.clone();
    for (target, name) in [
        (&parent, "deeper"),
        (&parent, "same-parent"),
        (&peer.id, "deeper-again"),
        (&parent, "shallower"),
    ] {
        moved = f.apply(movement(&moved, target, name, None)).node.unwrap();
        assert_eq!(moved.id, subtree.id);
        assert_eq!(
            f.engine.lookup(&f.admin.id, &moved.id, "leaf").unwrap().0,
            leaf
        );
        assert_eq!(
            f.engine
                .read(&f.alice.id, &leaf.id, None, 0, 64, None)
                .unwrap(),
            b"deep content"
        );
        let candidates = vec![moved.id.clone(), leaf.id.clone(), file.id.clone()];
        let validated = f.engine.validate_search(&f.alice.id, &candidates).unwrap();
        assert_eq!(validated.nodes.len(), 3);
        assert!(
            f.engine
                .view(&f.alice.id)
                .unwrap()
                .nodes
                .iter()
                .any(|entry| entry.node.id == leaf.id)
        );
        f.engine.validate("tenant").unwrap();
    }
    let before = f.engine.view(&f.admin.id).unwrap();
    let error = f
        .engine
        .mutate(
            &f.admin.id,
            f.admin.request_id(),
            movement(&peer, &peer.id, "cycle", None),
        )
        .unwrap_err();
    assert_eq!(error.code, libc::EINVAL);
    assert_eq!(f.engine.view(&f.admin.id).unwrap().head, before.head);
    assert_eq!(f.engine.view(&f.admin.id).unwrap().nodes, before.nodes);
    f.grant(&parent, "alice", 0);
    assert_eq!(
        f.engine
            .read(&f.alice.id, &leaf.id, None, 0, 64, None)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert!(
        f.engine
            .validate_search(&f.alice.id, std::slice::from_ref(&leaf.id))
            .unwrap()
            .nodes
            .is_empty()
    );
    let file = f
        .apply(movement(&file, &peer.id, "file-moved", None))
        .node
        .unwrap();
    assert_eq!(f.engine.stat(&f.admin.id, &file.id, None).unwrap(), file);
    let expected = f.engine.view(&f.admin.id).unwrap();
    f.engine.persist().unwrap();
    drop(f.engine);
    let engine = Engine::open(f.dir.path(), credentials(), Limits::default()).unwrap();
    let admin = engine.login("admin").unwrap();
    assert_eq!(engine.view(&admin.id).unwrap().nodes, expected.nodes);
    assert_eq!(
        engine.read(&admin.id, &leaf.id, None, 0, 64, None).unwrap(),
        b"deep content"
    );
    engine.validate("tenant").unwrap();
}

#[test]
fn corrupt_ancestry_fails_without_a_depth_cutoff() {
    let f = Fixture::new();
    let mut a = f.create(&f.root, "a", Kind::Directory);
    let b = f.create(&a.id, "b", Kind::Directory);
    a.parent = Some(b.id.clone());
    let mut batch = dfs_poc::store::WriteBatch::default();
    f.engine
        .store
        .put(
            &mut batch,
            "metadata",
            dfs_poc::store::key("tenant", &["node", &a.id]),
            &a,
        )
        .unwrap();
    f.engine.store.publish(batch).unwrap();
    assert_eq!(
        f.engine.stat(&f.admin.id, &a.id, None).unwrap_err().code,
        libc::ELOOP
    );
    assert_eq!(f.engine.view(&f.admin.id).unwrap_err().code, libc::ELOOP);
    assert_eq!(
        f.engine
            .validate_search(&f.admin.id, &[a.id])
            .unwrap_err()
            .code,
        libc::ELOOP
    );
}

#[test]
fn deeper_moves_preserve_mixed_subtrees_and_content() {
    let f = Fixture::new();
    let source = f.create(&f.root, "source", Kind::Directory);
    let nested = f.create(&source.id, "nested", Kind::Directory);
    let empty = f.create(&nested.id, "empty", Kind::Directory);
    let file = f.write(
        &f.create(&nested.id, "file", Kind::File),
        b"retained content",
    );
    let target = f.create(&f.root, "target", Kind::Directory);
    let target = f.create(&target.id, "deeper", Kind::Directory);
    let moved = f
        .apply(movement(&source, &target.id, "moved", None))
        .node
        .unwrap();
    assert_eq!(moved.id, source.id);
    assert_eq!(
        f.engine
            .lookup(&f.admin.id, &moved.id, "nested")
            .unwrap()
            .0
            .id,
        nested.id
    );
    assert_eq!(
        f.engine
            .lookup(&f.admin.id, &nested.id, "empty")
            .unwrap()
            .0
            .id,
        empty.id
    );
    assert_eq!(
        f.engine.lookup(&f.admin.id, &nested.id, "file").unwrap().0,
        file
    );
    assert_eq!(
        f.engine
            .read(&f.admin.id, &file.id, None, 0, 64, None)
            .unwrap(),
        b"retained content"
    );
    f.engine.validate("tenant").unwrap();
}

#[test]
fn moving_directory_into_itself_or_descendants_preserves_namespace() {
    let f = Fixture::new();
    let a = f.create(&f.root, "a", Kind::Directory);
    let b = f.create(&a.id, "b", Kind::Directory);
    let c = f.create(&b.id, "c", Kind::Directory);
    let before = f.engine.metrics(&f.admin.id).unwrap();
    let before_nodes = f.engine.view(&f.admin.id).unwrap().nodes;
    for destination in [&a, &b, &c] {
        let error = f
            .engine
            .mutate(
                &f.admin.id,
                f.admin.request_id(),
                movement(&a, &destination.id, "moved", None),
            )
            .unwrap_err();
        assert_eq!(error.code, libc::EINVAL);
        assert_eq!(
            f.engine.lookup(&f.admin.id, &f.root, "a").unwrap().0.id,
            a.id
        );
        assert_eq!(f.engine.lookup(&f.admin.id, &a.id, "b").unwrap().0.id, b.id);
        assert_eq!(f.engine.lookup(&f.admin.id, &b.id, "c").unwrap().0.id, c.id);
        assert_eq!(f.engine.view(&f.admin.id).unwrap().nodes, before_nodes);
        let after = f.engine.metrics(&f.admin.id).unwrap();
        assert_eq!(after.published, before.published);
        assert_eq!(after.pending_bytes, before.pending_bytes);
    }
    f.engine.validate("tenant").unwrap();
}

#[test]
fn opposing_concurrent_moves_publish_one_acyclic_result() {
    let f = Fixture::new();
    for round in 0..16 {
        let a = f.create(&f.root, &format!("a-{round}"), Kind::Directory);
        let b = f.create(&f.root, &format!("b-{round}"), Kind::Directory);
        let before = f.engine.metrics(&f.admin.id).unwrap();
        let barrier = Arc::new(Barrier::new(3));
        let threads: Vec<_> = [
            movement(&a, &b.id, &a.name, None),
            movement(&b, &a.id, &b.name, None),
        ]
        .into_iter()
        .map(|mutation| {
            let engine = f.engine.clone();
            let session = f.admin.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                engine.mutate(&session.id, session.request_id(), mutation)
            })
        })
        .collect();
        barrier.wait();
        let results: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|result| result
                    .as_ref()
                    .is_err_and(|error| error.code == libc::EINVAL))
                .count(),
            1
        );
        let (child, parent) = if results[0].is_ok() {
            (&a, &b)
        } else {
            (&b, &a)
        };
        assert_eq!(
            f.engine
                .lookup(&f.admin.id, &f.root, &parent.name)
                .unwrap()
                .0
                .id,
            parent.id
        );
        assert_eq!(
            f.engine
                .lookup(&f.admin.id, &parent.id, &child.name)
                .unwrap()
                .0
                .id,
            child.id
        );
        assert_eq!(
            f.engine
                .lookup(&f.admin.id, &f.root, &child.name)
                .unwrap_err()
                .code,
            libc::ENOENT
        );
        assert_eq!(
            f.engine.metrics(&f.admin.id).unwrap().published,
            before.published + 1
        );
        f.engine.validate("tenant").unwrap();
    }
}

#[test]
fn invalid_replacements_and_stale_tokens_do_not_publish() {
    let f = Fixture::new();
    let file = f.create(&f.root, "file", Kind::File);
    let directory = f.create(&f.root, "directory", Kind::Directory);
    let occupied = f.create(&f.root, "occupied", Kind::Directory);
    f.create(&occupied.id, "child", Kind::File);
    let mut stale_source = file.clone();
    stale_source.entry_token = id();
    let cases = [
        (
            movement(
                &file,
                &f.root,
                &directory.name,
                Some(directory.entry_token.clone()),
            ),
            libc::EISDIR,
        ),
        (
            movement(
                &directory,
                &f.root,
                &file.name,
                Some(file.entry_token.clone()),
            ),
            libc::ENOTDIR,
        ),
        (
            movement(
                &directory,
                &f.root,
                &occupied.name,
                Some(occupied.entry_token.clone()),
            ),
            libc::ENOTEMPTY,
        ),
        (
            movement(&file, &f.root, &directory.name, Some(id())),
            libc::ESTALE,
        ),
        (
            movement(&stale_source, &f.root, "renamed", None),
            libc::ESTALE,
        ),
    ];
    let before = f.engine.metrics(&f.admin.id).unwrap();
    let before_nodes = f.engine.view(&f.admin.id).unwrap().nodes;
    for (mutation, expected) in cases {
        assert_eq!(
            f.engine
                .mutate(&f.admin.id, f.admin.request_id(), mutation)
                .unwrap_err()
                .code,
            expected
        );
        let after = f.engine.metrics(&f.admin.id).unwrap();
        assert_eq!(after.published, before.published);
        assert_eq!(after.pending_bytes, before.pending_bytes);
    }
    assert_eq!(f.engine.view(&f.admin.id).unwrap().nodes, before_nodes);
    for node in [&file, &directory, &occupied] {
        assert_eq!(
            f.engine
                .lookup(&f.admin.id, &f.root, &node.name)
                .unwrap()
                .0
                .id,
            node.id
        );
    }
    f.engine.validate("tenant").unwrap();
}
