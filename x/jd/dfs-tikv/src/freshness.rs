use std::time::{Duration, Instant};

pub const MAX_EVENTUAL_CONSISTENCY_DELAY: Duration = Duration::from_millis(500);

#[derive(Clone, Copy, Debug)]
pub struct Freshness {
    validation_started: Instant,
}

impl Freshness {
    pub fn from_validation_started_at(validation_started: Instant) -> Self {
        Self { validation_started }
    }

    pub fn remaining_at(self, now: Instant) -> Duration {
        MAX_EVENTUAL_CONSISTENCY_DELAY
            .saturating_sub(now.saturating_duration_since(self.validation_started))
    }

    pub fn requires_refresh_at(self, now: Instant) -> bool {
        self.remaining_at(now).is_zero()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kernel_and_daemon_share_one_deadline() {
        let started = Instant::now();
        let freshness = Freshness::from_validation_started_at(started);
        let kernel_reply_at = started + Duration::from_millis(200);
        let kernel_ttl = freshness.remaining_at(kernel_reply_at);
        assert_eq!(kernel_ttl, Duration::from_millis(300));
        assert!(freshness.requires_refresh_at(kernel_reply_at + kernel_ttl));
        assert!(!freshness.requires_refresh_at(started + Duration::from_millis(499)));
    }

    #[test]
    fn cache_hits_do_not_extend_server_validation() {
        let started = Instant::now();
        let freshness = Freshness::from_validation_started_at(started);
        for elapsed_ms in [100, 200, 499] {
            let copied = freshness;
            assert_eq!(
                copied.remaining_at(started + Duration::from_millis(elapsed_ms)),
                Duration::from_millis(500 - elapsed_ms)
            );
        }
        assert!(freshness.requires_refresh_at(started + Duration::from_secs(1)));
    }

    #[test]
    fn slow_refresh_does_not_create_an_extra_cache_window() {
        let started = Instant::now();
        let freshness = Freshness::from_validation_started_at(started);
        assert_eq!(
            freshness.remaining_at(started + Duration::from_secs(2)),
            Duration::ZERO
        );
    }
}
