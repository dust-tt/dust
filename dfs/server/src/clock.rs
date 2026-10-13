use std::{
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
pub struct ClockError;

impl fmt::Display for ClockError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("system time outside the unix millisecond range")
    }
}

impl std::error::Error for ClockError {}

pub fn now_ms() -> Result<u64, ClockError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ClockError)?
        .as_millis()
        .try_into()
        .map_err(|_| ClockError)
}
