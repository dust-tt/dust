//! The committer: applies the op log to the server in order, one `Apply` batch in flight.

use std::sync::Arc;
use std::time::{Duration, Instant};

use dfs_proto::{Errno, Request, Response};

use crate::fs::Fs;

const SWEEP_EVERY: Duration = Duration::from_secs(5);

/// @cc [owner:fontanierh,label:concurrency;product] ordered-commit
/// Batches MUST be applied one at a time in log order: a batch is sent only after the previous
/// one finished, and each batch takes ops from the front of the queue. Every unsealed change is
/// sealed into the batch being formed, so an acknowledged `write` waits for at most one batch.
pub async fn run(fs: Arc<Fs>) {
    let mut swept = Instant::now();
    loop {
        let batch = fs.state.lock().take_batch();
        if batch.is_empty() {
            if swept.elapsed() > SWEEP_EVERY {
                fs.state.lock().sweep();
                swept = Instant::now();
            }
            if !fs.client.is_connected() {
                fs.progress.notify_all();
            }
            let _ = tokio::time::timeout(Duration::from_millis(100), fs.wake.notified()).await;
            continue;
        }
        let mut sent_ops = Vec::with_capacity(batch.len());
        let mut batch = batch;
        for pending in &mut batch {
            // The payload leaves with the request; only bookkeeping stays.
            let summary = pending.op_summary();
            sent_ops.push(std::mem::replace(&mut pending.op, summary));
        }
        let count = sent_ops.len();
        let sent = Instant::now();
        let reply = fs.client.call(Request::Apply { ops: sent_ops }).await;
        fs.stats.rpc("apply", sent.elapsed());
        let outcome = match reply.result {
            Ok(Response::Applied { version, results, attrs }) if results.len() == count => Ok((version, results, attrs)),
            Ok(_) => Err(Errno::EIO),
            Err(errno) => Err(errno),
        };
        let failures = fs.state.lock().finish(batch, outcome, sent);
        for failure in failures {
            eprintln!("{}", serde_json::json!({ "message": "dropped op", "op": failure }));
        }
        fs.progress.notify_all();
    }
}
