use super::*;

#[test]
fn buffering_excludes_rpc_waits_without_double_counting_or_renewal() {
    let start = Instant::now();
    let at = |ms| start + Duration::from_millis(ms);
    let first = Receipt::new(1);
    let second = Receipt::new(2);
    let _ = first.submitted.set(at(50));
    let _ = first.completed.set(at(250));
    let _ = second.submitted.set(at(100));
    let _ = second.completed.set(at(300));
    assert_eq!(
        buffered_for(start, at(350), &[first.clone(), second.clone()]),
        Duration::from_millis(100)
    );
    assert_eq!(
        buffered_for(at(200), at(350), &[first, second]),
        Duration::from_millis(50)
    );
    let queued = Receipt::new(3);
    assert_eq!(
        buffered_for(start, at(250), std::slice::from_ref(&queued)),
        Duration::from_millis(250)
    );
    let _ = queued.submitted.set(at(100));
    assert_eq!(
        buffered_for(start, at(500), std::slice::from_ref(&queued)),
        Duration::from_millis(100)
    );
    let _ = queued.completed.set(at(500));
    assert_eq!(
        buffered_for(start, at(650), &[queued]),
        Duration::from_millis(250)
    );
}
