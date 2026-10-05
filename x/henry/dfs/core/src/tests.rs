use dfs_store::memory::{Fault, MemoryStore};

use super::*;

struct World {
    fs: Fs<MemoryStore>,
    store: MemoryStore,
    admin: Caller,
    seq: AtomicU64,
}

impl World {
    async fn new() -> Self {
        let store = MemoryStore::new();
        let fs = Fs::new(store.clone());
        let token = fs.provision(vec![("team".into(), Right::Write)], "admin").await.unwrap_or_default();
        let principal = fs.authenticate(&token).await.unwrap_or_else(|_| Principal { name: String::new(), admin: false });
        let admin = Caller { principal, session: 1, seq: 0, resent: false };
        let world = Self { fs, store, admin, seq: AtomicU64::new(1) };
        world.fs.set_members(&world.caller(&world.admin.principal), "team", &["alice".into(), "bob".into()]).await.ok();
        world
    }

    fn caller(&self, principal: &Principal) -> Caller {
        Caller { principal: principal.clone(), session: 1, seq: self.seq.fetch_add(1, Ordering::Relaxed), resent: false }
    }
}

fn user(name: &str) -> Principal {
    Principal { name: name.into(), admin: false }
}

fn created(mutation: Mutation) -> Attr {
    match mutation.response {
        Response::Created { attr, .. } => attr,
        other => panic!("unexpected {other:?}"),
    }
}

#[tokio::test]
async fn create_flush_read_round_trip_with_zero_read_close() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let file = created(w.fs.create(&w.caller(&alice), ROOT, "a.txt", Kind::File, 0o644, true, None).await?);
    let reads_before = w.fs.stats().zero_read_flushes.load(Ordering::Relaxed);
    let big: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
    w.fs.flush(&w.caller(&alice), file.id, &[(0, big.clone())], Some(42)).await?;
    assert_eq!(w.fs.stats().zero_read_flushes.load(Ordering::Relaxed), reads_before + 1);
    assert_eq!(w.fs.getattr(&alice, file.id).await?.mtime_ns, 42);
    let Response::Data { bytes, size, .. } = w.fs.read(&alice, file.id, 65_000, 100_000).await? else { panic!() };
    assert_eq!(size, 200_000);
    assert_eq!(bytes, big[65_000..165_000]);
    // Partial overwrite of an existing block patches it in place.
    w.fs.flush(&w.caller(&alice), file.id, &[(10, vec![9; 5])], None).await?;
    let Response::Data { bytes, .. } = w.fs.read(&alice, file.id, 0, 20).await? else { panic!() };
    assert_eq!(&bytes[10..15], &[9; 5]);
    assert_eq!(bytes[9], big[9]);
    assert_eq!(bytes[15], big[15]);
    // Truncate then extend reads zeros in the hole.
    w.fs.setattr(&w.caller(&alice), file.id, None, Some(70_000), None).await?;
    w.fs.setattr(&w.caller(&alice), file.id, None, Some(140_000), None).await?;
    let Response::Data { bytes, .. } = w.fs.read(&alice, file.id, 69_990, 20).await? else { panic!() };
    assert_eq!(&bytes[..10], &big[69_990..70_000]);
    assert_eq!(&bytes[10..], &[0; 10]);
    Ok(())
}

#[tokio::test]
async fn boundaries_stop_inherited_writes() -> Result<(), Errno> {
    let w = World::new().await;
    let (alice, bob, eve) = (user("alice"), user("bob"), user("eve"));
    let skills = created(w.fs.create(&w.caller(&alice), ROOT, "skills", Kind::Dir, 0o755, true, None).await?);
    w.fs.set_boundary(&w.caller(&w.admin.principal), skills.id, true).await?;
    w.fs.grant(&w.caller(&w.admin.principal), skills.id, "alice", Right::Write, true).await?;
    assert!(w.fs.create(&w.caller(&alice), skills.id, "x", Kind::File, 0o644, true, None).await.is_ok());
    assert_eq!(w.fs.create(&w.caller(&bob), skills.id, "y", Kind::File, 0o644, true, None).await.err(), Some(Errno::EACCES));
    assert!(w.fs.lookup(&bob, skills.id, "x").await?.is_some_and(|a| !a.writable));
    assert_eq!(w.fs.lookup(&eve, ROOT, "skills").await.err(), Some(Errno::EACCES));
    assert_eq!(w.fs.grant(&w.caller(&alice), skills.id, "eve", Right::Read, true).await.err(), Some(Errno::EPERM));
    // Revoking alice's membership takes effect on the next call (epoch bump, no stale cache).
    w.fs.set_members(&w.caller(&w.admin.principal), "team", &["bob".into()]).await?;
    assert_eq!(w.fs.lookup(&alice, ROOT, "skills").await.err(), Some(Errno::EACCES));
    assert_eq!(w.fs.lookup(&alice, skills.id, "x").await?.map(|a| a.writable), Some(true));
    w.fs.grant(&w.caller(&w.admin.principal), skills.id, "alice", Right::Write, false).await?;
    assert_eq!(w.fs.lookup(&alice, skills.id, "x").await.err(), Some(Errno::EACCES));
    Ok(())
}

#[tokio::test]
async fn errors_are_rederived_at_a_fresh_version() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    w.fs.create(&w.caller(&alice), ROOT, "d", Kind::Dir, 0o755, true, None).await?;
    // Another writer (bypassing this server's version cache) removes the directory.
    let other = Fs::new(w.store.clone());
    other.remove(&w.caller(&alice), ROOT, "d", true).await?;
    // A reused read version would still see the directory; the create must report ENOENT only
    // after confirming it at a fresh version, and a re-create must succeed.
    assert!(w.fs.create(&w.caller(&alice), ROOT, "d", Kind::Dir, 0o755, true, None).await.is_ok());
    assert_eq!(w.fs.create(&w.caller(&alice), ROOT, "d", Kind::Dir, 0o755, true, None).await.err(), Some(Errno::EEXIST));
    Ok(())
}

#[tokio::test]
async fn uncertain_commit_is_applied_exactly_once() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let caller = w.caller(&alice);
    w.store.inject(Fault::CommitThenUncertain);
    let first = created(w.fs.create(&caller, ROOT, "once", Kind::File, 0o644, true, None).await?);
    // The same call resent by the client after a reconnect returns the original result.
    let resent = Caller { resent: true, ..caller };
    let again = created(w.fs.create(&resent, ROOT, "once", Kind::File, 0o644, true, None).await?);
    assert_eq!(first.id, again.id);
    w.store.inject(Fault::DropThenUncertain);
    assert!(w.fs.create(&w.caller(&alice), ROOT, "dropped", Kind::File, 0o644, true, None).await.is_ok());
    assert!(w.fs.lookup(&alice, ROOT, "dropped").await?.is_some());
    Ok(())
}

#[tokio::test]
async fn rename_rejects_cycles_and_replaces_files() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let a = created(w.fs.create(&w.caller(&alice), ROOT, "a", Kind::Dir, 0o755, true, None).await?);
    let b = created(w.fs.create(&w.caller(&alice), a.id, "b", Kind::Dir, 0o755, true, None).await?);
    assert_eq!(w.fs.rename(&w.caller(&alice), ROOT, "a", b.id, "a", false).await.err(), Some(Errno::EINVAL));
    let x = created(w.fs.create(&w.caller(&alice), ROOT, "x", Kind::File, 0o644, true, None).await?);
    w.fs.create(&w.caller(&alice), b.id, "y", Kind::File, 0o644, true, None).await?;
    w.fs.rename(&w.caller(&alice), ROOT, "x", b.id, "y", false).await?;
    assert_eq!(w.fs.lookup(&alice, b.id, "y").await?.map(|a| a.id), Some(x.id));
    assert_eq!(w.fs.lookup(&alice, ROOT, "x").await?, None);
    assert_eq!(w.fs.remove(&w.caller(&alice), ROOT, "a", true).await.err(), Some(Errno::ENOTEMPTY));
    let Response::Listing { entries, .. } = w.fs.readdir(&alice, b.id, None, 100).await? else { panic!() };
    assert_eq!(entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), vec!["y"]);
    Ok(())
}

#[tokio::test]
async fn concurrent_sibling_creates_do_not_conflict() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let callers: Vec<Caller> = (0..64).map(|_| w.caller(&alice)).collect();
    let results = futures::future::join_all(
        callers.iter().enumerate().map(|(i, c)| w.fs.create(c, ROOT, Box::leak(format!("f{i}").into_boxed_str()), Kind::File, 0o644, true, None)),
    )
    .await;
    assert!(results.iter().all(Result::is_ok));
    assert_eq!(w.fs.stats().retries.load(Ordering::Relaxed), 0);
    Ok(())
}

#[tokio::test]
async fn sizes_are_bounded_and_rename_needs_directory_parents() -> Result<(), Errno> {
    let w = World::new().await;
    let alice = user("alice");
    let file = created(w.fs.create(&w.caller(&alice), ROOT, "f", Kind::File, 0o644, true, None).await?);
    w.fs.flush(&w.caller(&alice), file.id, &[(0, vec![7; 10])], None).await?;
    assert_eq!(w.fs.setattr(&w.caller(&alice), file.id, None, Some(dfs_proto::MAX_FILE_BYTES + 1), None).await.err(), Some(Errno::EFBIG));
    assert_eq!(w.fs.flush(&w.caller(&alice), file.id, &[(u64::MAX - 1, vec![1; 4])], None).await.err(), Some(Errno::EFBIG));
    w.fs.flush(&w.caller(&alice), file.id, &[(100, Vec::new())], None).await?;
    assert_eq!(w.fs.getattr(&alice, file.id).await?.size, 10);
    w.fs.create(&w.caller(&alice), ROOT, "g", Kind::File, 0o644, true, None).await?;
    assert_eq!(w.fs.rename(&w.caller(&alice), ROOT, "g", file.id, "g", false).await.err(), Some(Errno::ENOTDIR));
    Ok(())
}
