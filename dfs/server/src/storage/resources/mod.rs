pub mod directory;
pub mod file;
pub mod keys;
pub mod object;
mod page;
pub mod session;
pub mod tenant;

/**
 * @cc [owner:spolu,label:backend] shared-subject-size-limit
 * Session subjects and ALLOW grant subjects MUST use this shared maximum of 1,024 UTF-8 bytes.
 */
const SUBJECT_MAX_BYTES: usize = 1_024;
