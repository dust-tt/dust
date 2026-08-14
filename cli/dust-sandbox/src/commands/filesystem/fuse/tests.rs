use std::fs;
use std::os::unix::fs::{symlink, PermissionsExt};
use std::sync::atomic::AtomicUsize;
use std::sync::Arc;

use tempfile::tempdir;

use super::{acquire_remote_permit, local_statfs, read_token};

#[test]
fn token_open_never_follows_a_symbolic_link() {
    let directory = tempdir().expect("temporary directory");
    let target = directory.path().join("target");
    let link = directory.path().join("token");
    fs::write(&target, "secret").expect("write target");
    fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).expect("restrict target");
    symlink(&target, &link).expect("create link");

    let error = read_token(&link).expect_err("reject link");
    assert_eq!(
        error
            .root_cause()
            .downcast_ref::<std::io::Error>()
            .and_then(std::io::Error::raw_os_error),
        Some(libc::ELOOP)
    );
}

#[test]
fn statfs_reports_the_real_staging_filesystem() {
    let directory = tempdir().expect("temporary directory");
    let stats = local_statfs(directory.path()).expect("read statvfs");
    assert!(stats.blocks > 0);
    assert!(stats.block_size > 0);
    assert!(stats.name_length > 0);
}

#[test]
fn remote_operation_limit_rejects_excess_work_until_a_permit_is_released() {
    let in_flight = Arc::new(AtomicUsize::new(0));
    let first = acquire_remote_permit(&in_flight, 2).expect("first permit");
    let second = acquire_remote_permit(&in_flight, 2).expect("second permit");
    assert!(acquire_remote_permit(&in_flight, 2).is_none());

    drop(first);
    assert!(acquire_remote_permit(&in_flight, 2).is_some());
    drop(second);
}
