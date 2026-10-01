//! Mount bookkeeping is portable; only the kernel adapter depends on Linux.
pub mod inodes;
#[cfg(target_os = "linux")]
pub mod linux;
