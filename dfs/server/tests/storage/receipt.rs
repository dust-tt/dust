use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{Context, Result};
use foundationdb::{FdbError, tuple::pack};

use super::*;

type TestResult<T> = Result<T, storage::Error<TestError>>;

#[derive(Debug)]
struct TestError;

impl fmt::Display for TestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("body rejected")
    }
}

impl std::error::Error for TestError {}

#[test]
fn receipt_storage() -> Result<()> {
    // SAFETY: this is the only FDB network boot in the library test binary.
    #[allow(unsafe_code)]
    let _network = unsafe { foundationdb::boot() };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(async {
        receipts_retry_uncommitted_bodies_and_replay_committed_results().await?;
        late_commits_replay_the_committing_attempts_result().await?;
        body_errors_abort_writes_without_a_receipt().await?;
        cleanup_is_bounded_and_preserves_the_cutoff_and_recent_receipts().await?;
        expired_or_incomplete_receipts_never_run_the_body().await
    })
}

async fn increment(tx: &Transaction, key: &[u8]) -> TestResult<u64> {
    let value = tx.get(key, false).await.map_err(FdbBindingError::from)?;
    let value: u64 = value
        .as_deref()
        .map(unpack)
        .transpose()
        .map_err(FdbBindingError::PackError)?
        .unwrap_or(0);
    tx.set(key, &pack(&(value + 1)));
    Ok(value + 1)
}

async fn receipts_retry_uncommitted_bodies_and_replay_committed_results() -> Result<()> {
    let mut receipt = Receipt::new()?;
    let key = namespace_subspace().pack(&("receipt-test", Uuid::now_v7().as_bytes().as_slice()));
    let calls = AtomicUsize::new(0);
    let tx = fdb::database()?.create_trx()?;
    let (value, version) = receipt
        .attempt(&tx, || async {
            calls.fetch_add(1, Ordering::Relaxed);
            increment(&tx, &key).await
        })
        .await?;
    assert_eq!((value, version), (1, None));
    let concurrent = fdb::database()?.create_trx()?;
    concurrent.set(&key, &pack(&10u64));
    concurrent.commit().await?;
    let error: FdbError = tx
        .commit()
        .await
        .err()
        .context("expected write conflict")?
        .into();
    assert_eq!(error.code(), 1020);
    let tx = fdb::database()?.create_trx()?;
    assert!(tx.get(&receipt.key(), false).await?.is_none());

    let committed = receipt
        .with_transaction(|tx| {
            let key = &key;
            let calls = &calls;
            async move {
                calls.fetch_add(1, Ordering::Relaxed);
                increment(&tx, key).await
            }
        })
        .await?;
    assert_eq!(committed.0, 11);
    assert_eq!(calls.load(Ordering::Relaxed), 2);
    let replayed = receipt
        .with_transaction(|tx| {
            let key = &key;
            let calls = &calls;
            async move {
                calls.fetch_add(1, Ordering::Relaxed);
                increment(&tx, key).await
            }
        })
        .await?;
    assert_eq!(replayed, committed);
    assert_eq!(calls.load(Ordering::Relaxed), 2);
    let tx = fdb::database()?.create_trx()?;
    let stored: u64 = unpack(&tx.get(&key, false).await?.context("missing counter")?)?;
    assert_eq!(stored, 11);
    let (_, stamp): (Uuid, Versionstamp) = unpack(
        &tx.get(&receipt.key(), false)
            .await?
            .context("missing marker")?,
    )?;
    assert_eq!(
        fdb::version_from_stamp(stamp.transaction_version()),
        committed.1
    );
    tx.clear(&key);
    tx.clear(&receipt.key());
    tx.commit().await?;
    Ok(())
}

async fn late_commits_replay_the_committing_attempts_result() -> Result<()> {
    let mut receipt = Receipt::new()?;
    let first = fdb::database()?.create_trx()?;
    let second = fdb::database()?.create_trx()?;
    receipt
        .attempt(&first, || async { Ok::<_, storage::Error<TestError>>(1) })
        .await?;
    receipt
        .attempt(&second, || async { Ok::<_, storage::Error<TestError>>(2) })
        .await?;
    // The earlier attempt commits after the later one has saved a different result.
    first.commit().await?;
    let error: FdbError = second
        .commit()
        .await
        .err()
        .context("expected receipt conflict")?
        .into();
    assert_eq!(error.code(), 1020);
    let calls = AtomicUsize::new(0);
    let replayed = receipt
        .with_transaction(|_tx| async {
            calls.fetch_add(1, Ordering::Relaxed);
            Ok::<_, storage::Error<TestError>>(3)
        })
        .await?;
    assert_eq!(replayed.0, 1);
    assert_eq!(calls.load(Ordering::Relaxed), 0);
    let tx = fdb::database()?.create_trx()?;
    tx.clear(&receipt.key());
    tx.commit().await?;
    Ok(())
}

async fn body_errors_abort_writes_without_a_receipt() -> Result<()> {
    let mut receipt: Receipt<()> = Receipt::new()?;
    let key = namespace_subspace().pack(&("receipt-test", Uuid::now_v7().as_bytes().as_slice()));
    let calls = AtomicUsize::new(0);
    let result = receipt
        .with_transaction(|tx| {
            let key = &key;
            let calls = &calls;
            async move {
                calls.fetch_add(1, Ordering::Relaxed);
                tx.set(key, b"must not commit");
                Err(storage::Error::Resource(TestError))
            }
        })
        .await;
    assert!(matches!(result, Err(storage::Error::Resource(TestError))));
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    let tx = fdb::database()?.create_trx()?;
    assert!(tx.get(&key, false).await?.is_none());
    assert!(tx.get(&receipt.key(), false).await?.is_none());
    assert!(receipt.results.lock().await.is_empty());
    Ok(())
}

async fn cleanup_is_bounded_and_preserves_the_cutoff_and_recent_receipts() -> Result<()> {
    // Historical fixture timestamps keep the sweep away from other tests' current receipts.
    let cutoff_ms = 1_000_000;
    let now_ms = cutoff_ms + LIFETIME_MS + CLEANUP_GRACE_MS;
    let prefix = subspace();
    let tx = fdb::database()?.create_trx()?;
    tx.clear_range(&prefix.range().0, &prefix.pack(&(now_ms + 1)));
    for _ in 0..=CLEANUP_BATCH_SIZE {
        tx.set(
            &prefix.pack(&(cutoff_ms - 1, Uuid::now_v7().as_bytes().as_slice())),
            &[],
        );
    }
    let at_cutoff = prefix.pack(&(cutoff_ms, Uuid::now_v7().as_bytes().as_slice()));
    let recent = prefix.pack(&(now_ms, Uuid::now_v7().as_bytes().as_slice()));
    tx.set(&at_cutoff, &[]);
    tx.set(&recent, &[]);
    tx.commit().await?;
    for expected in [CLEANUP_BATCH_SIZE, 1, 0] {
        let tx = fdb::database()?.create_trx()?;
        assert_eq!(clear_expired(&tx, now_ms).await?, expected);
        assert!(tx.get(&at_cutoff, false).await?.is_some());
        assert!(tx.get(&recent, false).await?.is_some());
        tx.commit().await?;
    }
    let tx = fdb::database()?.create_trx()?;
    tx.clear(&at_cutoff);
    tx.clear(&recent);
    tx.commit().await?;
    Ok(())
}

async fn expired_or_incomplete_receipts_never_run_the_body() -> Result<()> {
    let calls = AtomicUsize::new(0);
    let mut expired = Receipt::new()?;
    expired.created_at_ms = 1;
    let tx = fdb::database()?.create_trx()?;
    tx.set(&expired.key(), &[]);
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    clear_expired(&tx, LIFETIME_MS + CLEANUP_GRACE_MS + 2).await?;
    assert!(tx.get(&expired.key(), false).await?.is_none());
    tx.commit().await?;
    let result = expired
        .with_transaction(|_tx| async {
            calls.fetch_add(1, Ordering::Relaxed);
            Ok::<_, storage::Error<TestError>>(())
        })
        .await;
    assert!(matches!(
        result,
        Err(storage::Error::Receipt(Error::Expired))
    ));
    assert_eq!(calls.load(Ordering::Relaxed), 0);

    let mut missing = Receipt::new()?;
    let tx = fdb::database()?.create_trx()?;
    tx.atomic_op(
        &missing.key(),
        &pack_with_versionstamp(&(Uuid::now_v7(), Versionstamp::incomplete(0))),
        MutationType::SetVersionstampedValue,
    );
    tx.commit().await?;
    let result = missing
        .with_transaction(|_tx| async {
            calls.fetch_add(1, Ordering::Relaxed);
            Ok::<_, storage::Error<TestError>>(())
        })
        .await;
    assert!(matches!(
        result,
        Err(storage::Error::Receipt(Error::MissingResult))
    ));
    assert_eq!(calls.load(Ordering::Relaxed), 0);
    let tx = fdb::database()?.create_trx()?;
    tx.clear(&missing.key());
    tx.commit().await?;
    Ok(())
}
