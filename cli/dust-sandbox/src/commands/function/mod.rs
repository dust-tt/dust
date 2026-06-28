use std::path::PathBuf;

use anyhow::{anyhow, Result};

const FUNCTIONS_DIR_ENV: &str = "DUST_FUNCTIONS_DIR";

/// A valid function name is a non-empty string of `[A-Za-z0-9_-]`. This both
/// matches the tool-name convention and prevents path traversal.
#[allow(dead_code)]
fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Resolve a function name to `${DUST_FUNCTIONS_DIR}/<name>.ts`.
#[allow(dead_code)]
fn resolve_function_path(name: &str) -> Result<PathBuf> {
    if !is_valid_name(name) {
        return Err(anyhow!(
            "invalid function name {name:?}: must match [A-Za-z0-9_-]+"
        ));
    }
    let dir = std::env::var(FUNCTIONS_DIR_ENV)
        .ok()
        .filter(|d| !d.is_empty())
        .ok_or_else(|| anyhow!("{FUNCTIONS_DIR_ENV} is not set"))?;
    Ok(PathBuf::from(dir).join(format!("{name}.ts")))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn accepts_simple_names() {
        assert!(is_valid_name("greet"));
        assert!(is_valid_name("add_two"));
        assert!(is_valid_name("multiply-2"));
    }

    #[test]
    fn rejects_path_traversal_and_separators() {
        assert!(!is_valid_name(""));
        assert!(!is_valid_name(".."));
        assert!(!is_valid_name("../x"));
        assert!(!is_valid_name("a/b"));
        assert!(!is_valid_name("a\\b"));
        assert!(!is_valid_name("a.b"));
    }

    #[test]
    fn resolve_uses_env_dir_and_appends_ts() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("DUST_FUNCTIONS_DIR", "/files/functions");
        let path = resolve_function_path("greet").expect("resolves");
        assert_eq!(path, std::path::PathBuf::from("/files/functions/greet.ts"));
        std::env::remove_var("DUST_FUNCTIONS_DIR");
    }

    #[test]
    fn resolve_errors_when_env_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("DUST_FUNCTIONS_DIR");
        assert!(resolve_function_path("greet").is_err());
    }

    #[test]
    fn resolve_errors_on_bad_name() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("DUST_FUNCTIONS_DIR", "/files/functions");
        assert!(resolve_function_path("../escape").is_err());
        std::env::remove_var("DUST_FUNCTIONS_DIR");
    }
}
