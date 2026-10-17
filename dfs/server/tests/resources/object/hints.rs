use super::*;
use anyhow::{Context, Result};
use dfs_protocol::rpc::{AllowGrant, grant};

fn hint(parent_id: Option<ObjectId>) -> Hint {
    Hint {
        parent_id,
        grants_version: 1,
        grants: Arc::from([]),
    }
}

#[tokio::test]
async fn hint_reads_refresh_recency_before_eviction() {
    let hints = TreeHints::new(2);
    let older = ObjectId::new_v7();
    let newer = ObjectId::new_v7();
    let incoming = ObjectId::new_v7();
    let parent = ObjectId::new_v7();
    hints
        .remember(
            "tenant",
            [(older, hint(Some(parent))), (newer, hint(Some(parent)))],
            [],
        )
        .await;

    hints.predict("tenant", &[older]).await;
    hints.remember("tenant", [(incoming, hint(None))], []).await;

    assert_eq!(
        hints.predict("tenant", &[older]).await,
        HashSet::from([older, parent])
    );
    assert_eq!(
        hints.predict("tenant", &[newer]).await,
        HashSet::from([newer])
    );
}

#[tokio::test]
async fn hints_evict_by_recency_and_isolate_tenants() -> Result<()> {
    let hints = TreeHints::new(2);
    let frequent = ObjectId::new_v7();
    let recent = ObjectId::new_v7();
    let incoming = ObjectId::new_v7();
    let parent = ObjectId::new_v7();
    hints
        .remember(
            "one",
            [(frequent, hint(Some(parent))), (recent, hint(None))],
            [],
        )
        .await;
    for _ in 0..3 {
        assert_eq!(
            hints.predict("one", &[frequent]).await,
            HashSet::from([frequent, parent])
        );
    }
    assert_eq!(
        hints.predict("two", &[frequent]).await,
        HashSet::from([frequent])
    );
    hints.predict("one", &[recent]).await;
    hints.remember("two", [(incoming, hint(None))], []).await;
    {
        let cache = hints.entries.lock().await;
        let cache = cache.as_ref().context("disabled hints")?;
        assert_eq!(cache.len(), 2);
        assert!(!cache.contains(&("one".to_owned(), frequent)));
        assert!(cache.contains(&("one".to_owned(), recent)));
        assert!(cache.contains(&("two".to_owned(), incoming)));
    }
    // Updating a parent also refreshes recency, so the other entry is evicted next.
    hints
        .remember("one", [(recent, hint(Some(parent)))], [])
        .await;
    hints.remember("one", [(frequent, hint(None))], []).await;
    {
        let cache = hints.entries.lock().await;
        let cache = cache.as_ref().context("disabled hints")?;
        assert_eq!(cache.len(), 2);
        assert!(cache.contains(&("one".to_owned(), recent)));
        assert!(!cache.contains(&("two".to_owned(), incoming)));
    }
    assert_eq!(
        hints.predict("one", &[recent]).await,
        HashSet::from([recent, parent])
    );
    hints.remember("one", [], [recent]).await;
    assert_eq!(
        hints.predict("one", &[recent]).await,
        HashSet::from([recent])
    );
    let cache = hints.entries.lock().await;
    assert_eq!(cache.as_ref().context("disabled hints")?.len(), 1);
    Ok(())
}

#[tokio::test]
async fn hints_stop_at_cycles_and_support_zero_capacity() {
    let hints = TreeHints::new(2);
    let a = ObjectId::new_v7();
    let b = ObjectId::new_v7();
    hints
        .remember("tenant", [(a, hint(Some(b))), (b, hint(Some(a)))], [])
        .await;
    assert_eq!(
        hints.predict("tenant", &[a, b]).await,
        HashSet::from([a, b])
    );

    let disabled = TreeHints::new(0);
    disabled.remember("tenant", [(a, hint(Some(b)))], []).await;
    assert_eq!(disabled.predict("tenant", &[a]).await, HashSet::from([a]));
    assert!(disabled.entries.lock().await.is_none());
    assert!(disabled.cached_grants("tenant", [(a, 1)]).await.is_empty());
}

#[tokio::test]
async fn cached_grants_require_matching_tenant_and_version() -> Result<()> {
    let hints = TreeHints::new(2);
    let id = ObjectId::new_v7();
    let grants: Arc<[Grant]> = Arc::from([Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: "reader".to_owned(),
            mode: 4,
        })),
    }]);
    hints
        .remember(
            "one",
            [(
                id,
                Hint {
                    grants: Arc::clone(&grants),
                    ..hint(None)
                },
            )],
            [],
        )
        .await;
    hints.remember("two", [(id, hint(None))], []).await;

    let one = hints.cached_grants("one", [(id, 1)]).await;
    assert_eq!(one.get(&id).context("missing grants")?, &grants);
    let two = hints.cached_grants("two", [(id, 1)]).await;
    assert!(two.get(&id).context("missing empty grants")?.is_empty());
    assert!(hints.cached_grants("one", [(id, 2)]).await.is_empty());

    hints
        .remember(
            "one",
            [(
                id,
                Hint {
                    grants_version: 2,
                    ..hint(None)
                },
            )],
            [],
        )
        .await;
    assert!(hints.cached_grants("one", [(id, 1)]).await.is_empty());
    assert!(
        hints
            .cached_grants("one", [(id, 2)])
            .await
            .contains_key(&id)
    );
    hints.remember("one", [], [id]).await;
    assert!(hints.cached_grants("one", [(id, 2)]).await.is_empty());
    Ok(())
}

#[tokio::test]
async fn grant_cache_reads_refresh_recency_before_eviction() {
    let hints = TreeHints::new(2);
    let older = ObjectId::new_v7();
    let newer = ObjectId::new_v7();
    let incoming = ObjectId::new_v7();
    hints
        .remember("tenant", [(older, hint(None)), (newer, hint(None))], [])
        .await;
    hints.cached_grants("tenant", [(older, 1)]).await;
    hints.remember("tenant", [(incoming, hint(None))], []).await;

    let grants = hints
        .cached_grants("tenant", [(older, 1), (newer, 1)])
        .await;
    assert!(grants.contains_key(&older));
    assert!(!grants.contains_key(&newer));
}
