use anyhow::{Result, ensure};
use parking_lot::{Condvar, Mutex};
use serde::Serialize;
use std::{sync::Arc, time::Instant};

#[derive(Clone, Copy, Default, Serialize)]
pub struct Usage {
    pub used_bytes: usize,
    pub peak_bytes: usize,
    pub waiters: usize,
    pub waits: u64,
    pub rejections: u64,
}

pub struct Budget {
    limit: usize,
    max_waiters: usize,
    usage: Mutex<Usage>,
    available: Condvar,
}

impl Budget {
    pub fn new(limit: usize, max_waiters: usize) -> Arc<Self> {
        Arc::new(Self {
            limit,
            max_waiters,
            usage: Mutex::new(Usage::default()),
            available: Condvar::new(),
        })
    }

    pub fn usage(&self) -> Usage {
        *self.usage.lock()
    }

    pub fn acquire(self: &Arc<Self>, bytes: usize, deadline: Instant) -> Result<Reservation> {
        let mut usage = self.usage.lock();
        if bytes > self.limit {
            usage.rejections = usage.rejections.saturating_add(1);
            anyhow::bail!("allocation exceeds byte budget");
        }
        if usage.used_bytes > self.limit - bytes {
            if usage.waiters == self.max_waiters {
                usage.rejections = usage.rejections.saturating_add(1);
                anyhow::bail!("byte budget wait queue full");
            }
            usage.waiters += 1;
            usage.waits = usage.waits.saturating_add(1);
            while usage.used_bytes > self.limit - bytes {
                if Instant::now() >= deadline {
                    usage.waiters -= 1;
                    usage.rejections = usage.rejections.saturating_add(1);
                    anyhow::bail!("byte budget deadline");
                }
                self.available.wait_until(&mut usage, deadline);
            }
            usage.waiters -= 1;
        }
        usage.used_bytes += bytes;
        usage.peak_bytes = usage.peak_bytes.max(usage.used_bytes);
        Ok(Reservation {
            budget: self.clone(),
            bytes,
        })
    }
}

pub struct Reservation {
    budget: Arc<Budget>,
    bytes: usize,
}

impl Reservation {
    pub fn bytes(&self) -> usize {
        self.bytes
    }

    pub fn try_grow(&mut self, additional: usize) -> Result<()> {
        let mut usage = self.budget.usage.lock();
        if additional > self.budget.limit - usage.used_bytes {
            usage.rejections = usage.rejections.saturating_add(1);
            anyhow::bail!("byte budget growth unavailable");
        }
        usage.used_bytes += additional;
        usage.peak_bytes = usage.peak_bytes.max(usage.used_bytes);
        self.bytes += additional;
        Ok(())
    }

    pub fn shrink_to(&mut self, bytes: usize) -> Result<()> {
        ensure!(bytes <= self.bytes, "reservation shrink cannot grow");
        self.budget.usage.lock().used_bytes -= self.bytes - bytes;
        self.bytes = bytes;
        self.budget.available.notify_all();
        Ok(())
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        self.budget.usage.lock().used_bytes -= self.bytes;
        self.budget.available.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn shared_ownership_retains_capacity_until_the_last_owner_exits() {
        let budget = Budget::new(8, 1);
        let first = Arc::new(budget.acquire(8, Instant::now()).unwrap());
        let last = first.clone();
        drop(first);
        assert!(budget.acquire(1, Instant::now()).is_err());
        assert_eq!(budget.usage().used_bytes, 8);
        drop(last);
        let released = budget.acquire(8, Instant::now()).unwrap();
        assert_eq!(budget.usage().peak_bytes, 8);
        drop(released);
        assert_eq!(budget.usage().used_bytes, 0);
    }

    #[test]
    fn growth_failure_and_deadlines_preserve_existing_reservations() {
        let budget = Budget::new(8, 1);
        let mut held = budget.acquire(6, Instant::now()).unwrap();
        assert!(held.try_grow(3).is_err());
        assert_eq!(held.bytes(), 6);
        assert!(budget.acquire(3, Instant::now()).is_err());
        assert_eq!(budget.usage().waiters, 0);
        assert!(held.shrink_to(7).is_err());
        held.shrink_to(2).unwrap();
        held.try_grow(6).unwrap();
        assert_eq!(budget.usage().used_bytes, 8);
        drop(held);
        assert_eq!(budget.usage().used_bytes, 0);
        assert!(budget.acquire(9, Instant::now()).is_err());
    }

    #[test]
    fn release_wakes_waiters_and_full_queues_reject_immediately() {
        let budget = Budget::new(8, 0);
        let held = budget.acquire(8, Instant::now()).unwrap();
        assert!(
            budget
                .acquire(1, Instant::now() + Duration::from_secs(60))
                .is_err()
        );
        drop(held);
        let budget = Budget::new(8, 1);
        let held = budget.acquire(8, Instant::now()).unwrap();
        let waiting = budget.clone();
        let thread = std::thread::spawn(move || {
            waiting
                .acquire(8, Instant::now() + Duration::from_secs(5))
                .unwrap()
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while budget.usage().waiters == 0 {
            assert!(Instant::now() < deadline, "waiter did not start");
            std::thread::yield_now();
        }
        drop(held);
        let admitted = thread.join().unwrap();
        assert_eq!(budget.usage().used_bytes, 8);
        drop(admitted);
        assert_eq!(budget.usage().used_bytes, 0);
    }
}
