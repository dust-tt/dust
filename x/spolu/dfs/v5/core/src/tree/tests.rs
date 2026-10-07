use super::*;

fn image(id: ObjectId, parent: Option<ObjectId>, directory: bool, grants: &[u32]) -> Image {
    Image {
        id,
        parent,
        directory,
        grants: grants.iter().copied().map(GrantId).collect(),
    }
}

fn stamp(version: i64) -> crate::tree_log::Stamp {
    let mut bytes = [0; 10];
    bytes[..8].copy_from_slice(&version.to_be_bytes());
    crate::tree_log::Stamp(bytes)
}
#[test]
fn bootstrap_reconciles_out_of_order_base_rows_moves_and_tombstones() -> Result<(), Error> {
    let [root, left, right, file, deleted] = std::array::from_fn(|_| ObjectId::new_v4());
    let mut builder = Builder::new(root, 1024 * 1024);
    builder.merge(stamp(4), Update::Live(image(file, Some(right), false, &[])))?;
    builder.merge(stamp(5), Update::Deleted(deleted))?;
    builder.merge(stamp(1), Update::Live(image(file, Some(left), false, &[])))?;
    builder.merge(
        stamp(2),
        Update::Live(image(deleted, Some(left), false, &[])),
    )?;
    builder.merge(stamp(3), Update::Live(image(right, Some(root), true, &[7])))?;
    builder.merge(stamp(2), Update::Live(image(left, Some(root), true, &[9])))?;
    builder.merge(stamp(1), Update::Live(image(root, None, true, &[])))?;
    let tree = builder.finish()?;
    assert_eq!(tree.len(), 4);
    assert!(tree.allows(file, &[GrantId(7)]));
    assert!(!tree.allows(file, &[GrantId(9)]));
    assert!(!tree.contains(deleted));
    assert!(tree.parent_matches(file, Some(right)));
    Ok(())
}

#[test]
fn bootstrap_rejects_incomplete_cyclic_and_over_budget_state() -> Result<(), Error> {
    let [root, parent, child] = std::array::from_fn(|_| ObjectId::new_v4());
    let mut missing = Builder::new(root, 1024 * 1024);
    missing.merge(stamp(1), Update::Live(image(root, None, true, &[])))?;
    missing.merge(
        stamp(2),
        Update::Live(image(child, Some(parent), false, &[])),
    )?;
    assert!(matches!(missing.finish(), Err(Error::InvalidTree)));
    let mut cycle = Builder::new(root, 1024 * 1024);
    for node in [
        image(root, None, true, &[]),
        image(child, Some(parent), true, &[]),
        image(parent, Some(child), true, &[]),
    ] {
        cycle.merge(stamp(1), Update::Live(node))?;
    }
    assert!(matches!(cycle.finish(), Err(Error::InvalidTree)));
    let mut tiny = Builder::new(root, 100);
    assert_eq!(
        tiny.merge(stamp(1), Update::Live(image(root, None, true, &[]))),
        Err(Error::Capacity)
    );
    Ok(())
}

struct Fixture {
    root: ObjectId,
    left: ObjectId,
    right: ObjectId,
    file: ObjectId,
    tree: Tree,
}
impl Fixture {
    fn new() -> Result<Self, Error> {
        let [root, left, right, file] = std::array::from_fn(|_| ObjectId::new_v4());
        let tree = Tree::from_images(
            root,
            vec![
                image(file, Some(left), false, &[]),
                image(left, Some(root), true, &[7]),
                image(right, Some(root), true, &[9]),
                image(root, None, true, &[]),
            ],
        )?;
        Ok(Self {
            root,
            left,
            right,
            file,
            tree,
        })
    }
}

#[test]
fn inherited_grants_follow_moves_and_revocation() -> Result<(), Error> {
    let mut f = Fixture::new()?;
    assert!(f.tree.allows(f.file, &[GrantId(7)]));
    assert!(!f.tree.allows(f.file, &[GrantId(9)]));
    f.tree
        .apply(vec![Update::Live(image(f.left, Some(f.right), true, &[]))])?;
    assert!(!f.tree.allows(f.file, &[GrantId(7)]));
    assert!(f.tree.allows(f.file, &[GrantId(9)]));
    assert!(f.tree.parent_matches(f.left, Some(f.right)));
    assert!(!f.tree.parent_matches(f.left, Some(f.root)));
    f.tree
        .apply(vec![Update::Live(image(f.right, Some(f.root), true, &[]))])?;
    assert!(!f.tree.allows(f.file, &[GrantId(9)]));
    assert!(!f.tree.allows(ObjectId::new_v4(), &[GrantId(9)]));
    Ok(())
}

#[test]
fn replacement_is_atomic_and_slots_are_reclaimed() -> Result<(), Error> {
    let mut f = Fixture::new()?;
    let replacement = ObjectId::new_v4();
    f.tree.apply(vec![
        Update::Deleted(f.file),
        Update::Live(image(replacement, Some(f.right), false, &[])),
    ])?;
    assert!(!f.tree.contains(f.file));
    assert!(f.tree.allows(replacement, &[GrantId(9)]));
    let length = f.tree.parents.len();
    for _ in 0..100 {
        let id = ObjectId::new_v4();
        f.tree
            .apply(vec![Update::Live(image(id, Some(f.left), false, &[8, 8]))])?;
        assert!(f.tree.allows(id, &[GrantId(8)]));
        f.tree.apply(vec![Update::Deleted(id)])?;
    }
    assert_eq!(f.tree.parents.len(), length);
    assert_eq!(f.tree.grants.index.len(), 2);
    assert!(f.tree.grants.values.len() <= 3);
    assert_eq!(f.tree.len(), 4);
    Ok(())
}

#[test]
fn invalid_graph_changes_cannot_partially_publish() -> Result<(), Error> {
    let mut f = Fixture::new()?;
    for updates in [
        vec![Update::Deleted(f.left)],
        vec![Update::Deleted(f.root)],
        vec![Update::Live(image(f.left, Some(f.file), true, &[]))],
        vec![
            Update::Live(image(f.left, Some(f.right), true, &[])),
            Update::Live(image(f.right, Some(f.left), true, &[])),
        ],
        vec![Update::Live(image(
            f.left,
            Some(ObjectId::new_v4()),
            true,
            &[],
        ))],
        vec![Update::Live(image(f.left, Some(f.root), false, &[]))],
        vec![
            Update::Live(image(f.left, Some(f.root), true, &[])),
            Update::Deleted(f.left),
        ],
    ] {
        assert_eq!(f.tree.apply(updates), Err(Error::InvalidTree));
        assert!(f.tree.allows(f.file, &[GrantId(7)]));
        assert!(!f.tree.allows(f.file, &[GrantId(9)]));
        assert_eq!(f.tree.len(), 4);
    }
    f.tree
        .apply(vec![Update::Deleted(f.left), Update::Deleted(f.file)])?;
    assert!(!f.tree.contains(f.file));
    assert!(!f.tree.contains(f.left));
    assert_eq!(f.tree.len(), 2);
    Ok(())
}

#[test]
fn identical_explicit_policies_share_one_allocation() -> Result<(), Error> {
    let mut f = Fixture::new()?;
    f.tree.apply(vec![Update::Live(image(
        f.right,
        Some(f.root),
        true,
        &[7, 7],
    ))])?;
    assert_eq!(f.tree.grants.index.len(), 1);
    f.tree
        .apply(vec![Update::Live(image(f.left, Some(f.root), true, &[]))])?;
    assert_eq!(f.tree.grants.index.len(), 1);
    assert!(f.tree.allows(f.right, &[GrantId(7)]));
    f.tree
        .apply(vec![Update::Live(image(f.right, Some(f.root), true, &[]))])?;
    assert!(f.tree.grants.index.is_empty());
    Ok(())
}

#[test]
fn full_intervals_advance_freshness_but_only_changes_advance_generation() -> Result<(), Error> {
    let f = Fixture::new()?;
    let start = Instant::now();
    let initial = Proof {
        incarnation: ObjectId::new_v4(),
        generation: 1,
        read_version: 10,
        poll_started: start,
    };
    let tree = TenantTree::new(f.tree, initial, Duration::from_secs(30))?;
    let ids = [f.file, f.right, ObjectId::new_v4()];
    assert_eq!(
        tree.authorize(&ids, &[GrantId(7)], start)?.1,
        [true, false, false]
    );
    assert_eq!(
        tree.authorize_object(f.file, Some(f.left), &[GrantId(7)], start)?
            .1,
        Access::Allowed
    );
    assert_eq!(
        tree.authorize_object(f.file, Some(f.left), &[GrantId(9)], start)?
            .1,
        Access::Denied
    );
    assert_eq!(
        tree.authorize_object(f.file, Some(f.right), &[GrantId(7)], start)?
            .1,
        Access::Fallback
    );
    assert_eq!(
        tree.authorize_object(ids[2], Some(f.left), &[GrantId(7)], start)?
            .1,
        Access::Fallback
    );
    let deadline = start + Duration::from_secs(30);
    assert_eq!(
        tree.authorize(&ids, &[GrantId(7)], deadline),
        Err(Error::Stale)
    );
    let recent = start + Duration::from_secs(29);
    let proof = tree.publish_complete(initial, 20, recent, vec![], deadline)?;
    assert_eq!(proof.generation, initial.generation);
    assert_eq!(proof.poll_started, recent);
    assert_eq!(
        tree.authorize(&ids, &[GrantId(7)], deadline)?.1,
        [true, false, false]
    );
    assert_eq!(
        tree.publish_complete(initial, 30, recent, vec![], deadline),
        Err(Error::ConcurrentPublication)
    );
    assert_eq!(
        tree.publish_complete(proof, 30, start, vec![], deadline),
        Err(Error::Stale)
    );
    assert_eq!(tree.authorize(&ids, &[GrantId(7)], deadline)?.0, proof);
    let changed = tree.publish_complete(
        proof,
        30,
        recent,
        vec![Update::Live(image(f.left, Some(f.root), true, &[]))],
        deadline,
    )?;
    assert_eq!(changed.generation, 2);
    assert_eq!(
        tree.check_proof(proof, deadline),
        Err(Error::ConcurrentPublication)
    );
    assert_eq!(
        tree.authorize(&ids, &[GrantId(7)], deadline)?.1,
        [false, false, false]
    );
    assert!(tree.check_proof(changed, deadline).is_ok());
    Ok(())
}

#[test]
fn search_scope_and_grants_share_one_generation() -> Result<(), Error> {
    let f = Fixture::new()?;
    let now = Instant::now();
    let proof = Proof {
        incarnation: ObjectId::new_v4(),
        generation: 0,
        read_version: 1,
        poll_started: now,
    };
    let tree = TenantTree::new(f.tree, proof, Duration::from_secs(30))?;
    let ids = [f.root, f.left, f.right, f.file, ObjectId::new_v4()];
    let (_, allowed) = tree.authorize_scoped(&ids, &[GrantId(7)], Some((f.left, true)), now)?;
    assert_eq!(allowed, vec![false, false, false, true, false]);
    let (_, allowed) = tree.authorize_scoped(&ids, &[GrantId(7)], Some((f.root, false)), now)?;
    assert_eq!(allowed, vec![false, true, false, false, false]);
    let (_, allowed) = tree.authorize_scoped(&ids, &[GrantId(9)], Some((f.left, true)), now)?;
    assert_eq!(allowed, vec![false; 5]);
    let (_, allowed) = tree.authorize_scoped(&ids, &[GrantId(7)], Some((f.file, true)), now)?;
    assert_eq!(allowed, vec![false; 5]);
    assert_eq!(
        tree.authorize_scoped(&ids, &[GrantId(7)], None, now + Duration::from_secs(31)),
        Err(Error::Stale)
    );
    Ok(())
}
