use super::*;
use anyhow::{Context, Result};

#[tokio::test]
async fn hints_evict_by_recency_and_isolate_tenants() -> Result<()> {
    let hints = TreeHints::new(2);
    let frequent = ObjectId::new_v7();
    let recent = ObjectId::new_v7();
    let incoming = ObjectId::new_v7();
    let parent = ObjectId::new_v7();
    hints
        .remember("one", [(frequent, Some(parent)), (recent, None)], [])
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
    hints.remember("two", [(incoming, None)], []).await;
    {
        let cache = hints.parents.lock().await;
        let cache = cache.as_ref().context("disabled hints")?;
        assert_eq!(cache.len(), 2);
        assert!(!cache.contains(&("one".to_owned(), frequent)));
        assert!(cache.contains(&("one".to_owned(), recent)));
        assert!(cache.contains(&("two".to_owned(), incoming)));
    }
    // Updating a parent also refreshes recency, so the other entry is evicted next.
    hints.remember("one", [(recent, Some(parent))], []).await;
    hints.remember("one", [(frequent, None)], []).await;
    {
        let cache = hints.parents.lock().await;
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
    let cache = hints.parents.lock().await;
    assert_eq!(cache.as_ref().context("disabled hints")?.len(), 1);
    Ok(())
}

#[tokio::test]
async fn hints_stop_at_cycles_and_support_zero_capacity() {
    let hints = TreeHints::new(2);
    let a = ObjectId::new_v7();
    let b = ObjectId::new_v7();
    hints
        .remember("tenant", [(a, Some(b)), (b, Some(a))], [])
        .await;
    assert_eq!(
        hints.predict("tenant", &[a, b]).await,
        HashSet::from([a, b])
    );

    let disabled = TreeHints::new(0);
    disabled.remember("tenant", [(a, Some(b))], []).await;
    assert_eq!(disabled.predict("tenant", &[a]).await, HashSet::from([a]));
    assert!(disabled.parents.lock().await.is_none());
}
