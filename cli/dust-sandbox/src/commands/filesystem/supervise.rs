//! Keeps the Dust FUSE mount running inside a sandbox.
//!
//! It starts `dsbx filesystem mount`, waits for it to exit, removes the stale
//! mount left by a crash, and starts a new child with a short backoff. A lock
//! prevents two supervisors from managing the same mount at once.

use std::ffi::CString;
use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use anyhow::Context;
use tracing::{info, warn};

use super::mount::MountArgs;

const INITIAL_RESTART_DELAY: Duration = Duration::from_millis(100);
const MAX_RESTART_DELAY: Duration = Duration::from_secs(5);
const HEALTHY_RUN_TIME: Duration = Duration::from_secs(30);

pub fn run(args: MountArgs) -> anyhow::Result<()> {
    let _lock = acquire_supervisor_lock(&args)?;
    let executable = std::env::current_exe().context("failed to locate dsbx executable")?;
    let mut restart_delay = INITIAL_RESTART_DELAY;

    loop {
        // A crashed FUSE process leaves a disconnected mount behind. Detach it
        // before restarting so /files never remains stuck with ENOTCONN.
        detach_mount(&args.mountpoint).context("failed to detach stale filesystem mount")?;
        let started = Instant::now();
        let mut command = Command::new(&executable);
        command
            .arg("filesystem")
            .arg("mount")
            .arg("--mountpoint")
            .arg(&args.mountpoint)
            .arg("--staging-dir")
            .arg(&args.staging_dir)
            .arg("--api-url")
            .arg(&args.api_url)
            .arg("--workspace-id")
            .arg(&args.workspace_id)
            .arg("--token-file")
            .arg(&args.token_file)
            .arg("--cache-capacity-mib")
            .arg(args.cache_capacity_mib.to_string());
        let supervisor_pid = unsafe { libc::getpid() };
        // SAFETY: pre_exec runs after fork and calls only async-signal-safe
        // syscalls. Checking getppid closes the small race where the supervisor
        // dies between fork and PR_SET_PDEATHSIG, before Linux arms the signal.
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                    return Err(io::Error::last_os_error());
                }
                if libc::getppid() != supervisor_pid {
                    return Err(io::Error::from_raw_os_error(libc::ECHILD));
                }
                Ok(())
            });
        }
        let mut child = command
            .spawn()
            .context("failed to start filesystem mount child")?;
        info!(child_pid = child.id(), "started filesystem mount child");
        let status = child
            .wait()
            .context("failed to wait for filesystem mount child")?;
        let run_time = started.elapsed();
        if run_time >= HEALTHY_RUN_TIME {
            restart_delay = INITIAL_RESTART_DELAY;
        }
        warn!(
            ?status,
            run_time_ms = run_time.as_millis(),
            restart_delay_ms = restart_delay.as_millis(),
            "filesystem mount child exited; restarting"
        );
        std::thread::sleep(restart_delay);
        restart_delay = restart_delay.saturating_mul(2).min(MAX_RESTART_DELAY);
    }
}

fn acquire_supervisor_lock(args: &MountArgs) -> io::Result<File> {
    let mountpoint_parent = args
        .mountpoint
        .parent()
        .ok_or_else(|| io::Error::from_raw_os_error(libc::EINVAL))?;
    let mountpoint_name = args
        .mountpoint
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::from_raw_os_error(libc::EINVAL))?;
    let parent_metadata = fs::symlink_metadata(mountpoint_parent)?;
    if !parent_metadata.file_type().is_dir()
        || parent_metadata.uid() != unsafe { libc::geteuid() }
        || parent_metadata.permissions().mode() & 0o022 != 0
    {
        return Err(io::Error::from_raw_os_error(libc::EACCES));
    }
    // The lock follows the visible mountpoint, not the cache directory. Two
    // supervisors cannot detach each other's mount by choosing different caches.
    let lock_path = mountpoint_parent.join(format!(
        ".{mountpoint_name}.dust-filesystem-supervisor.lock"
    ));
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(lock_path)?;
    let metadata = lock.metadata()?;
    if !metadata.file_type().is_file()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.permissions().mode() & 0o077 != 0
    {
        return Err(io::Error::from_raw_os_error(libc::EACCES));
    }
    // SAFETY: flock only reads the valid descriptor owned by `lock`.
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(lock)
}

fn detach_mount(mountpoint: &std::path::Path) -> io::Result<()> {
    let Some((filesystem_type, source)) = mounted_filesystem(mountpoint)? else {
        return Ok(());
    };
    if !filesystem_type.starts_with("fuse") || source != "dust-files" {
        return Err(io::Error::from_raw_os_error(libc::EBUSY));
    }
    let path = CString::new(mountpoint.as_os_str().as_bytes())
        .map_err(|_| io::Error::from_raw_os_error(libc::EINVAL))?;
    // SAFETY: path is NUL-terminated and remains alive for the syscall.
    if unsafe { libc::umount2(path.as_ptr(), libc::MNT_DETACH) } == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    match error.raw_os_error() {
        Some(libc::EINVAL) | Some(libc::ENOENT) => Ok(()),
        _ => Err(error),
    }
}

fn mounted_filesystem(mountpoint: &Path) -> io::Result<Option<(String, String)>> {
    let mountinfo = fs::read_to_string("/proc/self/mountinfo")?;
    Ok(parse_mountinfo(&mountinfo, mountpoint))
}

fn parse_mountinfo(mountinfo: &str, mountpoint: &Path) -> Option<(String, String)> {
    for line in mountinfo.lines() {
        let Some((before_separator, after_separator)) = line.split_once(" - ") else {
            continue;
        };
        let Some(encoded_mountpoint) = before_separator.split_whitespace().nth(4) else {
            continue;
        };
        let Some(decoded_mountpoint) = decode_mountinfo_path(encoded_mountpoint) else {
            continue;
        };
        if decoded_mountpoint != mountpoint.as_os_str().as_bytes() {
            continue;
        }
        let mut fields = after_separator.split_whitespace();
        let filesystem_type = fields.next()?.to_owned();
        let source = fields.next()?.to_owned();
        return Some((filesystem_type, source));
    }
    None
}

fn decode_mountinfo_path(value: &str) -> Option<Vec<u8>> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'\\' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        let octal = bytes.get(index + 1..index + 4)?;
        if !octal.iter().all(|byte| matches!(byte, b'0'..=b'7')) {
            return None;
        }
        let value = (octal[0] - b'0') * 64 + (octal[1] - b'0') * 8 + (octal[2] - b'0');
        decoded.push(value);
        index += 4;
    }
    Some(decoded)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::parse_mountinfo;

    #[test]
    fn mountinfo_identifies_only_the_exact_mountpoint() {
        let mountinfo = concat!(
            "31 20 0:28 / /files-old rw - fuse.dust-files dust-files rw\n",
            "32 20 0:29 / /files rw - fuse.dust-files dust-files rw\n"
        );

        assert_eq!(
            parse_mountinfo(mountinfo, Path::new("/files")),
            Some(("fuse.dust-files".to_owned(), "dust-files".to_owned()))
        );
        assert_eq!(parse_mountinfo(mountinfo, Path::new("/missing")), None);
    }

    #[test]
    fn mountinfo_decodes_escaped_mountpoint_bytes() {
        let mountinfo = "32 20 0:29 / /run/dust\\040files rw - fuse.dust-files dust-files rw\n";

        assert_eq!(
            parse_mountinfo(mountinfo, Path::new("/run/dust files")),
            Some(("fuse.dust-files".to_owned(), "dust-files".to_owned()))
        );
    }
}
