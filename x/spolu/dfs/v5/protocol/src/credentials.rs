use std::{fs, io, path::Path};

/// @cc [owner:spolu,label:security] private-key-files
/// Key files MUST be regular files, at most 256 bytes, and inaccessible to group/other users on Unix.
/// Invalid keys MUST fail without including their contents in the error.
pub fn read_key(path: &Path) -> io::Result<String> {
    let file = fs::File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > 256 {
        return Err(io::Error::other("invalid key file"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(io::Error::other("key file must have mode 0600"));
        }
    }
    use io::Read;
    let mut value = String::new();
    file.take(257).read_to_string(&mut value)?;
    let value = value.trim();
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(io::Error::other("invalid key file"));
    }
    Ok(value.to_owned())
}

pub fn write_private(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    use io::Write;
    options.open(path)?.write_all(contents)
}
