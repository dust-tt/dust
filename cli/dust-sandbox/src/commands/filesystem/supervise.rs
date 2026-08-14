use std::ffi::CString;
use std::fs::{File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::process::CommandExt;
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
    let runtime_directory = args
        .staging_dir
        .parent()
        .ok_or_else(|| io::Error::from_raw_os_error(libc::EINVAL))?;
    let lock_path = runtime_directory.join("supervisor.lock");
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(lock_path)?;
    if lock.metadata()?.permissions().mode() & 0o077 != 0 {
        return Err(io::Error::from_raw_os_error(libc::EACCES));
    }
    // SAFETY: flock only reads the valid descriptor owned by `lock`.
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(lock)
}

fn detach_mount(mountpoint: &std::path::Path) -> io::Result<()> {
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
