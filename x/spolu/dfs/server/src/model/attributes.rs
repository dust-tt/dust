use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

/**
 * @cc [owner:spolu,label:backend] normalized-filesystem-time
 * Timestamps MUST preserve signed Unix seconds and nanoseconds in 0..1_000_000_000. Revisions,
 * rather than timestamps, MUST order mutations; wall clocks may move backwards.
 */
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Timestamp {
    pub seconds: i64,
    pub nanoseconds: u32,
}

impl Timestamp {
    pub const EPOCH: Self = Self {
        seconds: 0,
        nanoseconds: 0,
    };

    pub fn now() -> Result<Self> {
        let elapsed = SystemTime::now().duration_since(UNIX_EPOCH)?;
        Ok(Self {
            seconds: i64::try_from(elapsed.as_secs())?,
            nanoseconds: elapsed.subsec_nanos(),
        })
    }

    pub fn validate(self) -> Result<()> {
        ensure!(self.nanoseconds < 1_000_000_000, "invalid nanoseconds");
        Ok(())
    }
}

/**
 * @cc [owner:spolu,label:security] filesystem-attributes
 * Modes MUST contain only the low nine permission bits and MUST NOT confer server authority.
 * New objects MUST initialize all timestamps together. Only the server may set ctime; reads
 * MUST NOT change atime.
 */
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PosixAttributes {
    pub mode: u16,
    pub atime: Timestamp,
    pub mtime: Timestamp,
    pub ctime: Timestamp,
}

impl PosixAttributes {
    pub fn new(directory: bool, now: Timestamp) -> Self {
        Self {
            mode: if directory { 0o755 } else { 0o644 },
            atime: now,
            mtime: now,
            ctime: now,
        }
    }

    pub fn validate(&self) -> Result<()> {
        ensure!(self.mode <= 0o777, "unsupported mode bits");
        self.atime.validate()?;
        self.mtime.validate()?;
        self.ctime.validate()
    }
}
