//! Mount bookkeeping is portable; only the kernel adapter depends on Linux.
pub mod inodes;
#[cfg(any(target_os = "linux", target_os = "macos"))]
pub mod linux;
