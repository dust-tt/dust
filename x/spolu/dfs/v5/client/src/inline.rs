//! A synchronous cache probe that stops at blocking points before accepting a mutation.
use std::{cell::Cell, future::poll_fn, task::Poll};

thread_local! {
    static INLINE: Cell<bool> = const { Cell::new(false) };
    static EFFECTIVE: Cell<bool> = const { Cell::new(false) };
}
const DEFERRED: &str = "dfs-local-inline-deferred";

pub fn active() -> bool {
    INLINE.get()
}
pub fn effective() -> bool {
    EFFECTIVE.get()
}
pub(crate) fn accept() {
    if active() {
        EFFECTIVE.set(true);
    }
}
pub(crate) fn deferred() -> tonic::Status {
    tonic::Status::cancelled(DEFERRED)
}
pub fn is_deferred(status: &tonic::Status) -> bool {
    status.code() == tonic::Code::Cancelled && status.message() == DEFERRED
}

/// @cc [owner:spolu,label:concurrency;performance] inline-before-effects
/// Inline probes MUST stop before RPCs, capacity waits and pending mutation barriers. A completed
/// mutation MUST never be replayed. Blocking or multi-admission operations MUST defer before their
/// first mutation; guards/reservations from an incomplete probe MUST release on cancellation.
pub fn probe<T>(operation: impl FnOnce() -> T) -> T {
    struct Restore(bool, bool);
    impl Drop for Restore {
        fn drop(&mut self) {
            INLINE.set(self.0);
            EFFECTIVE.set(self.1);
        }
    }
    let _restore = Restore(INLINE.replace(true), EFFECTIVE.replace(false));
    operation()
}

pub(crate) async fn blocking_point() {
    poll_fn(|_| {
        if active() {
            Poll::Pending
        } else {
            Poll::Ready(())
        }
    })
    .await
}
