use dfs_store::memory::{Fault, MemoryStore};

use super::*;

struct World {
    fs: Fs<MemoryStore>,
    store: MemoryStore,
    admin: Caller,
    seq: AtomicU64,
    ids: Mutex<HashMap<String, (Id, Id)>>,
}

impl World {
    async fn new() -> Self {
        let store = MemoryStore::new();
        let fs = Fs::new(store.clone());
        let token = fs.provision(vec![("team".into(), Right::Write)], "admin").await.unwrap_or_default();
        let principal = fs.authenticate(&token).await.unwrap_or_else(|_| Principal { name: String::new(), admin: false });
        let admin = Caller { principal, session: 1, seq: 0, resent: false };
        let world = Self { fs, store, admin, seq: AtomicU64::new(1), ids: Mutex::default() };
        world.fs.set_members(&world.caller(&world.admin.principal), "team", &["alice".into(), "bob".into()]).await.ok();
        world
    }

    fn caller(&self, principal: &Principal) -> Caller {
        Caller { principal: principal.clone(), session: 1, seq: self.seq.fetch_add(1, Ordering::Relaxed), resent: false }
    }

    async fn id(&self, principal: &Principal) -> Result<Id, Errno> {
        let next = self.ids.lock().get_mut(&principal.name).filter(|(next, end)| next < end).map(|(next, _)| {
            *next += 1;
            *next - 1
        });
        if let Some(id) = next {
            return Ok(id);
        }
        let (first, count) = self.fs.alloc_ids(principal).await?;
        self.ids.lock().insert(principal.name.clone(), (first + 1, first + count as u64));
        Ok(first)
    }

    async fn apply(&self, principal: &Principal, ops: Vec<Op>) -> Result<Vec<Option<Errno>>, Errno> {
        match self.fs.apply(&self.caller(principal), &ops).await? {
            Response::Applied { results, .. } => Ok(results),
            other => panic!("unexpected {other:?}"),
        }
    }

    async fn one(&self, principal: &Principal, op: Op) -> Result<(), Errno> {
        match self.apply(principal, vec![op]).await?[0] {
            Some(errno) => Err(errno),
            None => Ok(()),
        }
    }

    async fn create(&self, principal: &Principal, parent: Id, name: &str, kind: Kind) -> Result<Id, Errno> {
        let id = self.id(principal).await?;
        self.one(principal, Op::Create { parent, name: name.into(), id, kind, mode: 0o755, mtime_ns: 1, target: None }).await?;
        Ok(id)
    }

    async fn write(&self, principal: &Principal, id: Id, changes: Vec<Change>) -> Result<(), Errno> {
        self.one(principal, Op::Write { id, changes, mtime_ns: None }).await
    }

    async fn rename(&self, principal: &Principal, parent: Id, name: &str, new_parent: Id, new_name: &str) -> Result<(), Errno> {
        let id = self.fs.lookup(principal, parent, name).await?.0.ok_or(Errno::ENOENT)?.id;
        let op = Op::Rename { parent, name: name.into(), id, new_parent, new_name: new_name.into(), no_replace: false };
        self.one(principal, op).await
    }

    async fn remove(&self, principal: &Principal, parent: Id, name: &str) -> Result<(), Errno> {
        let id = self.fs.lookup(principal, parent, name).await?.0.ok_or(Errno::ENOENT)?.id;
        self.one(principal, Op::Remove { parent, name: name.into(), id }).await
    }

    async fn read(&self, principal: &Principal, id: Id, offset: u64, len: u32) -> Result<(u64, Vec<u8>), Errno> {
        match self.fs.read(principal, id, offset, len).await?.0 {
            Response::Data { size, bytes, .. } => Ok((size, bytes)),
            other => panic!("unexpected {other:?}"),
        }
    }

    async fn names(&self, principal: &Principal, dir: Id) -> Result<Vec<String>, Errno> {
        match self.fs.readdir(principal, dir, None, 100, None).await?.0 {
            Response::Listing { entries, .. } => Ok(entries.into_iter().map(|e| e.name).collect()),
            other => panic!("unexpected {other:?}"),
        }
    }
}

impl World {
    async fn token(&self, principal: &Principal, dir: Id) -> Result<Token, Errno> {
        match self.fs.readdir(principal, dir, None, 100, None).await?.0 {
            Response::Listing { token, .. } => Ok(token),
            other => panic!("unexpected {other:?}"),
        }
    }

    async fn valid(&self, principal: &Principal, dir: Id, token: Token) -> Result<bool, Errno> {
        Ok(self.fs.validate(principal, &[(dir, token)]).await?.0[0])
    }
}

fn user(name: &str) -> Principal {
    Principal { name: name.into(), admin: false }
}

fn write(offset: u64, bytes: &[u8]) -> Change {
    Change::Write { offset, bytes: bytes.to_vec() }
}

#[tokio::test]
async fn create_write_read_round_trip() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let id = w.id(&alice).await?;
    let big: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
    let results = w
        .apply(&alice, vec![
            Op::Create { parent: ROOT, name: "a.txt".into(), id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None },
            Op::Write { id, changes: vec![write(0, &big)], mtime_ns: Some(42) },
        ])
        .await?;
    assert_eq!(results, vec![None, None]);
    assert_eq!(w.fs.getattr(&alice, id).await?.0.mtime_ns, 42);
    assert_eq!(w.read(&alice, id, 65_000, 100_000).await?, (200_000, big[65_000..165_000].to_vec()));
    // Partial overwrite of an existing block patches it in place.
    w.write(&alice, id, vec![write(10, &[9; 5])]).await?;
    let (_, bytes) = w.read(&alice, id, 0, 20).await?;
    assert_eq!((&bytes[10..15], bytes[9], bytes[15]), (&[9u8; 5][..], big[9], big[15]));
    // Truncate then extend reads zeros in the hole.
    w.write(&alice, id, vec![Change::Truncate(70_000), Change::Truncate(140_000)]).await?;
    let (_, bytes) = w.read(&alice, id, 69_990, 20).await?;
    assert_eq!((&bytes[..10], &bytes[10..]), (&big[69_990..70_000], &[0u8; 10][..]));
    // An O_TRUNC rewrite: size and blocks change together.
    w.write(&alice, id, vec![Change::Truncate(0), write(0, b"short")]).await?;
    assert_eq!(w.read(&alice, id, 0, 1 << 20).await?, (5, b"short".to_vec()));
    assert_eq!(w.fs.fsck().await?, Vec::<String>::new());
    Ok(())
}

#[tokio::test]
async fn failed_ops_leave_no_effect_and_later_ops_apply() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let (a, a2, b) = (w.id(&alice).await?, w.id(&alice).await?, w.id(&alice).await?);
    let file = |name: &str, id| Op::Create { parent: ROOT, name: name.into(), id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None };
    let results = w
        .apply(&alice, vec![
            file("a", a),
            file("a", a2),
            Op::Write { id: a2, changes: vec![write(0, b"lost")], mtime_ns: None },
            Op::Write { id: a, changes: vec![write(0, b"kept")], mtime_ns: None },
            Op::Write { id: a, changes: vec![Change::Truncate(0), write(u64::MAX - 1, b"xx")], mtime_ns: None },
            Op::Rename { parent: ROOT, name: "missing".into(), id: a, new_parent: ROOT, new_name: "z".into(), no_replace: false },
            Op::Remove { parent: ROOT, name: "a".into(), id: a2 },
            file("b", b),
        ])
        .await?;
    assert_eq!(results, vec![None, Some(Errno::EEXIST), Some(Errno::ESTALE), None, Some(Errno::EFBIG), Some(Errno::ENOENT), Some(Errno::ENOENT), None]);
    assert_eq!(w.read(&alice, a, 0, 100).await?, (4, b"kept".to_vec()));
    assert_eq!(w.names(&alice, ROOT).await?, vec!["a", "b"]);
    assert_eq!(w.fs.fsck().await?, Vec::<String>::new());
    Ok(())
}

#[tokio::test]
async fn creates_need_ids_allocated_to_the_principal() -> Result<(), Errno> {
    let w = World::new().await;
    let (alice, bob) = (user("alice"), user("bob"));
    let theirs = w.id(&bob).await?;
    let op = |id| Op::Create { parent: ROOT, name: format!("f{id}"), id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None };
    assert_eq!(w.one(&alice, op(theirs)).await, Err(Errno::EPERM));
    assert_eq!(w.one(&alice, op(ROOT + 1)).await, Err(Errno::EPERM));
    let mine = w.id(&alice).await?;
    w.one(&alice, op(mine)).await?;
    // An id names at most one object, even for its owner.
    let again = Op::Create { parent: ROOT, name: "other".into(), id: mine, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None };
    assert_eq!(w.one(&alice, again).await, Err(Errno::EEXIST));
    Ok(())
}

#[tokio::test]
async fn boundaries_stop_inherited_writes() -> Result<(), Errno> {
    let w = World::new().await;
    let (alice, bob, eve) = (user("alice"), user("bob"), user("eve"));
    let skills = w.create(&alice, ROOT, "skills", Kind::Dir).await?;
    w.fs.set_boundary(&w.caller(&w.admin.principal), skills, true).await?;
    w.fs.grant(&w.caller(&w.admin.principal), skills, "alice", Right::Write, true).await?;
    let x = w.create(&alice, skills, "x", Kind::File).await?;
    assert_eq!(w.create(&bob, skills, "y", Kind::File).await.err(), Some(Errno::EACCES));
    assert_eq!(w.write(&bob, x, vec![write(0, b"no")]).await.err(), Some(Errno::EACCES));
    assert!(w.fs.lookup(&bob, skills, "x").await?.0.is_some_and(|a| !a.writable));
    assert_eq!(w.fs.lookup(&eve, ROOT, "skills").await.err(), Some(Errno::EACCES));
    assert_eq!(w.fs.grant(&w.caller(&alice), skills, "eve", Right::Read, true).await.err(), Some(Errno::EPERM));
    // Revoking alice's membership takes effect on the next call (epoch bump, no stale cache).
    w.fs.set_members(&w.caller(&w.admin.principal), "team", &["bob".into()]).await?;
    assert_eq!(w.fs.lookup(&alice, ROOT, "skills").await.err(), Some(Errno::EACCES));
    assert_eq!(w.fs.lookup(&alice, skills, "x").await?.0.map(|a| a.writable), Some(true));
    w.fs.grant(&w.caller(&w.admin.principal), skills, "alice", Right::Write, false).await?;
    assert_eq!(w.fs.lookup(&alice, skills, "x").await.err(), Some(Errno::EACCES));
    assert_eq!(w.write(&alice, x, vec![write(0, b"no")]).await.err(), Some(Errno::EACCES));
    Ok(())
}

#[tokio::test]
async fn stale_reused_versions_never_decide_an_outcome() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    w.create(&alice, ROOT, "d", Kind::Dir).await?;
    // Another server removes the directory; this server's reused read version still sees it, so
    // the re-create conflicts and reruns at a fresh version instead of reporting EEXIST.
    let other = World { fs: Fs::new(w.store.clone()), store: w.store.clone(), admin: w.admin.clone(), seq: AtomicU64::new(1 << 32), ids: Mutex::default() };
    other.remove(&alice, ROOT, "d").await?;
    assert!(w.create(&alice, ROOT, "d", Kind::Dir).await.is_ok());
    assert_eq!(w.create(&alice, ROOT, "d", Kind::Dir).await.err(), Some(Errno::EEXIST));
    Ok(())
}

#[tokio::test]
async fn uncertain_commit_is_applied_exactly_once() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let id = w.id(&alice).await?;
    let ops = vec![Op::Create { parent: ROOT, name: "once".into(), id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None }];
    let caller = w.caller(&alice);
    w.store.inject(Fault::CommitThenUncertain);
    let Response::Applied { results, version, .. } = w.fs.apply(&caller, &ops).await? else { panic!() };
    assert_eq!(results, vec![None]);
    // The same call resent returns the original outcome, at a version not older than its commit.
    let Response::Applied { results: again, version: later, .. } = w.fs.apply(&Caller { resent: true, ..caller }, &ops).await? else { panic!() };
    assert_eq!((again, later >= version), (vec![None], true));
    assert_eq!(w.names(&alice, ROOT).await?, vec!["once"]);
    w.store.inject(Fault::DropThenUncertain);
    assert!(w.create(&alice, ROOT, "dropped", Kind::File).await.is_ok());
    assert!(w.fs.lookup(&alice, ROOT, "dropped").await?.0.is_some());
    Ok(())
}

#[tokio::test]
async fn rename_rejects_cycles_and_replaces_files() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let a = w.create(&alice, ROOT, "a", Kind::Dir).await?;
    let b = w.create(&alice, a, "b", Kind::Dir).await?;
    assert_eq!(w.rename(&alice, ROOT, "a", b, "a").await.err(), Some(Errno::EINVAL));
    let x = w.create(&alice, ROOT, "x", Kind::File).await?;
    w.create(&alice, b, "y", Kind::File).await?;
    w.rename(&alice, ROOT, "x", b, "y").await?;
    assert_eq!(w.fs.lookup(&alice, b, "y").await?.0.map(|a| a.id), Some(x));
    assert_eq!(w.fs.lookup(&alice, ROOT, "x").await?.0, None);
    assert_eq!(w.remove(&alice, ROOT, "a").await.err(), Some(Errno::ENOTEMPTY));
    assert_eq!(w.names(&alice, b).await?, vec!["y"]);
    assert_eq!(w.fs.fsck().await?, Vec::<String>::new());
    Ok(())
}

#[tokio::test]
async fn ops_after_a_directory_move_see_the_new_tree() -> Result<(), Errno> {
    let w = World::new().await;
    let (alice, bob) = (user("alice"), user("bob"));
    let locked = w.create(&alice, ROOT, "locked", Kind::Dir).await?;
    w.fs.set_boundary(&w.caller(&w.admin.principal), locked, true).await?;
    w.fs.grant(&w.caller(&w.admin.principal), locked, "bob", Right::Write, true).await?;
    let (open, file) = (w.id(&bob).await?, w.id(&bob).await?);
    let results = w
        .apply(&bob, vec![
            Op::Create { parent: locked, name: "d".into(), id: open, kind: Kind::Dir, mode: 0o755, mtime_ns: 1, target: None },
            Op::Rename { parent: locked, name: "d".into(), id: open, new_parent: ROOT, new_name: "d".into(), no_replace: false },
            Op::Create { parent: open, name: "f".into(), id: file, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None },
        ])
        .await?;
    assert_eq!(results, vec![None, None, None]);
    // Moved out of the boundary, `d` is writable by every team member again.
    assert!(w.fs.getattr(&bob, open).await?.0.writable);
    let alice_id = w.id(&alice).await?;
    let op = Op::Create { parent: open, name: "g".into(), id: alice_id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None };
    assert_eq!(w.one(&alice, op).await, Ok(()));
    assert_eq!(w.fs.fsck().await?, Vec::<String>::new());
    Ok(())
}

#[tokio::test]
async fn concurrent_sibling_creates_do_not_conflict() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let mut batches = Vec::new();
    for i in 0..64 {
        let id = w.id(&alice).await?;
        batches.push(vec![Op::Create { parent: ROOT, name: format!("f{i}"), id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None }]);
    }
    let callers: Vec<Caller> = (0..64).map(|_| w.caller(&alice)).collect();
    let retries = w.fs.stats().retries.load(Ordering::Relaxed);
    let results = futures::future::join_all(callers.iter().zip(&batches).map(|(c, ops)| w.fs.apply(c, ops))).await;
    assert!(results.iter().all(|r| matches!(r, Ok(Response::Applied { results, .. }) if results == &vec![None])));
    assert_eq!(w.fs.stats().retries.load(Ordering::Relaxed), retries);
    Ok(())
}

#[tokio::test]
async fn sizes_are_bounded_and_rename_needs_directory_parents() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let file = w.create(&alice, ROOT, "f", Kind::File).await?;
    w.write(&alice, file, vec![write(0, &[7; 10])]).await?;
    assert_eq!(w.write(&alice, file, vec![Change::Truncate(dfs_proto::MAX_FILE_BYTES + 1)]).await.err(), Some(Errno::EFBIG));
    assert_eq!(w.write(&alice, file, vec![write(u64::MAX - 1, &[1; 4])]).await.err(), Some(Errno::EFBIG));
    let scattered = (0..=MAX_FLUSH_BLOCKS as u64).map(|i| write(i * BLOCK_BYTES, b"x")).collect();
    assert_eq!(w.write(&alice, file, scattered).await.err(), Some(Errno::EFBIG));
    w.write(&alice, file, vec![write(100, &[])]).await?;
    assert_eq!(w.fs.getattr(&alice, file).await?.0.size, 10);
    w.create(&alice, ROOT, "g", Kind::File).await?;
    assert_eq!(w.rename(&alice, ROOT, "g", file, "g").await.err(), Some(Errno::ENOTDIR));
    Ok(())
}

#[tokio::test]
async fn fsck_reports_blocks_past_the_size() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let file = w.create(&alice, ROOT, "f", Kind::File).await?;
    w.write(&alice, file, vec![write(0, &[7; 10])]).await?;
    assert_eq!(w.fs.fsck().await?, Vec::<String>::new());
    let mut txn = w.store.begin(TxnOptions::default()).await.map_err(|_| Errno::EIO)?;
    txn.set(&records::block(file, 1), b"orphan");
    txn.commit().await.map_err(|_| Errno::EIO)?;
    assert_eq!(w.fs.fsck().await?.len(), 1);
    Ok(())
}

#[tokio::test]
async fn listing_tokens_change_with_every_listed_change_only() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let d = w.create(&alice, ROOT, "d", Kind::Dir).await?;
    let e = w.create(&alice, d, "e", Kind::Dir).await?;
    let f = w.create(&alice, d, "f", Kind::File).await?;
    let g = w.create(&alice, e, "g", Kind::File).await?;
    let mut token = w.token(&alice, d).await?;
    // Changes outside `d`'s listing keep its token.
    w.create(&alice, ROOT, "other", Kind::File).await?;
    w.write(&alice, g, vec![write(0, b"g")]).await?;
    assert!(w.valid(&alice, d, token).await?);
    assert_eq!(w.token(&alice, d).await?, token);
    let changes: Vec<Op> = vec![
        Op::Write { id: f, changes: vec![write(0, b"f")], mtime_ns: None },
        Op::SetAttr { id: f, mode: Some(0o600), mtime_ns: None },
        Op::SetAttr { id: d, mode: Some(0o700), mtime_ns: None },
        Op::Create { parent: e, name: "h".into(), id: w.id(&alice).await?, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None },
        Op::Rename { parent: d, name: "f".into(), id: f, new_parent: ROOT, new_name: "f".into(), no_replace: false },
        Op::Rename { parent: ROOT, name: "f".into(), id: f, new_parent: d, new_name: "f".into(), no_replace: false },
        Op::Remove { parent: d, name: "f".into(), id: f },
    ];
    for op in changes {
        let summary = format!("{op:?}");
        w.one(&alice, op).await?;
        assert!(!w.valid(&alice, d, token).await?, "{summary} kept the token valid");
        let next = w.token(&alice, d).await?;
        assert_ne!(next, token, "{summary}");
        token = next;
        assert!(w.valid(&alice, d, token).await?);
    }
    // A policy change (epoch bump) invalidates every token; a removed directory is never valid.
    w.fs.set_members(&w.caller(&w.admin.principal), "team", &["alice".into()]).await?;
    assert!(!w.valid(&alice, d, token).await?);
    w.remove(&alice, e, "g").await?;
    w.remove(&alice, e, "h").await?;
    let token = w.token(&alice, e).await?;
    w.remove(&alice, d, "e").await?;
    assert!(!w.valid(&alice, e, token).await?);
    Ok(())
}
