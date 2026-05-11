use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::IpAddr;
use std::path::Path;

use anyhow::{anyhow, bail, ensure, Context, Result};
use serde::Deserialize;
use tracing::info;

const PLACEHOLDER_PREFIX: &str = "__DSEC_";
const PLACEHOLDER_SUFFIX: &str = "__";
const PLACEHOLDER_HEX_LEN: usize = 32;

// Slice 6 will consume `name` and `value` from the request rewriter. Slice 4
// only loads and plumbs the table so MITM scoping can key off the allowlist
// union.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Secret {
    pub name: String,
    pub placeholder: String,
    pub value: String,
    pub allowed_domains: DomainSet,
}

// `by_placeholder` and `sni_match_set` intentionally double-store the
// allowlist domains: per-secret membership drives Slice 6 substitution
// (placeholder -> value only fires for connections to that secret's
// allowed domains), while the union drives whether MITM kicks in at all
// for a given SNI. Same data, two access shapes; do not dedupe.
#[derive(Debug, Clone, Default)]
pub struct SecretTable {
    pub by_placeholder: HashMap<String, Secret>,
    pub sni_match_set: DomainSet,
}

impl SecretTable {
    // File-missing is expected during cold boot (dsbx may start before front
    // has written the file) so we treat it as "empty table = no MITM" and
    // continue. Read I/O errors and JSON parse errors are real bugs (front
    // owns this file) and we fail loudly at startup so they surface in logs
    // rather than silently degrading every connection to no-substitution.
    pub fn load(path: &Path) -> Result<Self> {
        let contents = match fs::read_to_string(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                info!(
                    path = %path.display(),
                    "egress secrets file missing; starting with empty secret table"
                );
                return Ok(Self::default());
            }
            Err(error) => {
                return Err(error).with_context(|| format!("failed to read {}", path.display()));
            }
        };

        let table = Self::parse(&contents)
            .with_context(|| format!("failed to parse {}", path.display()))?;
        info!(
            path = %path.display(),
            secret_count = table.len(),
            domain_pattern_count = table.sni_match_set.pattern_count(),
            "loaded egress secrets table"
        );
        Ok(table)
    }

    pub fn len(&self) -> usize {
        self.by_placeholder.len()
    }

    // Consumed by Slice 5 to short-circuit MITM when no secrets are loaded.
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.by_placeholder.is_empty()
    }

    fn parse(contents: &str) -> Result<Self> {
        let raw_secrets: Vec<RawSecret> =
            serde_json::from_str(contents).context("invalid egress secrets JSON")?;
        let mut table = Self::default();

        for raw_secret in raw_secrets {
            let secret = Secret::from_raw(raw_secret)?;
            let placeholder = secret.placeholder.clone();

            ensure!(
                !table.by_placeholder.contains_key(&placeholder),
                "duplicate egress secret placeholder {}",
                placeholder
            );

            table.sni_match_set.extend(&secret.allowed_domains);
            table.by_placeholder.insert(placeholder, secret);
        }

        Ok(table)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DomainSet {
    exact: HashSet<String>,
    wildcard_suffixes: HashSet<String>,
}

impl DomainSet {
    pub fn from_patterns(patterns: &[String]) -> Result<Self> {
        let mut set = Self::default();
        for pattern in patterns {
            set.insert(pattern)?;
        }
        Ok(set)
    }

    // Consumed by Slice 5 to gate MITM on SNI; tested directly in this slice.
    #[allow(dead_code)]
    pub fn matches(&self, domain: &str) -> bool {
        let domain = match normalize_dns_name(domain) {
            Ok(domain) => domain,
            Err(_) => return false,
        };

        self.exact.contains(&domain)
            || self.wildcard_suffixes.iter().any(|suffix| {
                domain.ends_with(suffix)
                    && domain.len() > suffix.len()
                    && domain.as_bytes()[domain.len() - suffix.len() - 1] == b'.'
            })
    }

    pub fn pattern_count(&self) -> usize {
        self.exact.len() + self.wildcard_suffixes.len()
    }

    fn insert(&mut self, pattern: &str) -> Result<()> {
        match DomainPattern::parse(pattern)? {
            DomainPattern::Exact(domain) => {
                self.exact.insert(domain);
            }
            DomainPattern::WildcardSuffix(suffix) => {
                self.wildcard_suffixes.insert(suffix);
            }
        }
        Ok(())
    }

    fn extend(&mut self, other: &Self) {
        self.exact.extend(other.exact.iter().cloned());
        self.wildcard_suffixes
            .extend(other.wildcard_suffixes.iter().cloned());
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DomainPattern {
    Exact(String),
    WildcardSuffix(String),
}

impl DomainPattern {
    fn parse(value: &str) -> Result<Self> {
        let value = value.trim().to_ascii_lowercase();
        ensure!(!value.is_empty(), "empty egress secret domain entry");

        if let Some(suffix) = value.strip_prefix("*.") {
            let suffix = normalize_dns_name(suffix)
                .map_err(|_| anyhow!("invalid wildcard domain entry: {value}"))?;
            ensure!(
                suffix.split('.').count() >= 2,
                "invalid wildcard domain entry: {}",
                value
            );
            return Ok(Self::WildcardSuffix(suffix));
        }

        let normalized =
            normalize_dns_name(&value).map_err(|_| anyhow!("invalid domain entry: {value}"))?;
        ensure!(
            normalized.split('.').count() >= 2,
            "invalid domain entry: {} (must have at least two labels)",
            value
        );
        Ok(Self::Exact(normalized))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSecret {
    name: String,
    placeholder: String,
    value: String,
    allowed_domains: Vec<String>,
}

impl Secret {
    fn from_raw(raw: RawSecret) -> Result<Self> {
        ensure!(!raw.name.is_empty(), "egress secret name cannot be empty");
        validate_placeholder(&raw.placeholder)
            .with_context(|| format!("invalid placeholder for egress secret {}", raw.name))?;
        ensure!(
            !raw.value.is_empty(),
            "egress secret {} has empty value",
            raw.name
        );
        ensure!(
            !raw.allowed_domains.is_empty(),
            "egress secret {} has no allowedDomains",
            raw.name
        );

        let allowed_domains = DomainSet::from_patterns(&raw.allowed_domains)
            .with_context(|| format!("invalid allowedDomains for egress secret {}", raw.name))?;

        Ok(Self {
            name: raw.name,
            placeholder: raw.placeholder,
            value: raw.value,
            allowed_domains,
        })
    }
}

fn validate_placeholder(placeholder: &str) -> Result<()> {
    let nonce = match placeholder
        .strip_prefix(PLACEHOLDER_PREFIX)
        .and_then(|value| value.strip_suffix(PLACEHOLDER_SUFFIX))
    {
        Some(nonce) => nonce,
        None => bail!("placeholder must use the __DSEC_<32hex>__ format"),
    };

    ensure!(
        nonce.len() == PLACEHOLDER_HEX_LEN
            && nonce
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
        "placeholder must use the __DSEC_<32hex>__ format"
    );

    Ok(())
}

fn normalize_dns_name(value: &str) -> Result<String, ()> {
    let value = value.to_ascii_lowercase();
    let value = value.strip_suffix('.').unwrap_or(&value).to_string();

    if value.is_empty() || value.parse::<IpAddr>().is_ok() || !is_valid_dns_name(&value) {
        return Err(());
    }

    Ok(value)
}

fn is_valid_dns_name(value: &str) -> bool {
    if value.len() > 253 {
        return false;
    }

    let mut labels = value.split('.');
    labels.all(is_valid_dns_label)
}

fn is_valid_dns_label(label: &str) -> bool {
    if label.is_empty() || label.len() > 63 {
        return false;
    }

    let bytes = label.as_bytes();
    if !bytes[0].is_ascii_alphanumeric() || !bytes[bytes.len() - 1].is_ascii_alphanumeric() {
        return false;
    }

    bytes
        .iter()
        .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_set_matches_exact_domains() -> Result<()> {
        let set = DomainSet::from_patterns(&["API.OpenAI.COM.".to_string()])?;

        assert!(set.matches("api.openai.com"));
        assert!(set.matches("API.OPENAI.COM."));
        assert!(!set.matches("www.api.openai.com"));
        assert!(!set.matches("openai.com"));

        Ok(())
    }

    #[test]
    fn domain_set_matches_wildcard_subdomains_only() -> Result<()> {
        let set = DomainSet::from_patterns(&["*.googleapis.com".to_string()])?;

        assert!(set.matches("storage.googleapis.com"));
        assert!(set.matches("a.b.googleapis.com"));
        assert!(!set.matches("googleapis.com"));
        assert!(!set.matches("evilgoogleapis.com"));

        Ok(())
    }

    #[test]
    fn domain_set_rejects_invalid_patterns() {
        for pattern in [
            "",
            "*.com",
            "127.0.0.1",
            "::1",
            "*",
            "*.*.com",
            "*example.com",
            ".example.com",
            "example..com",
            "host:443",
            "bad domain",
            "localhost",
            "single-label",
        ] {
            assert!(
                DomainSet::from_patterns(&[pattern.to_string()]).is_err(),
                "{pattern} should be rejected"
            );
        }
    }

    #[test]
    fn parses_egress_secrets_json() -> Result<()> {
        let table = SecretTable::parse(
            r#"[
              {
                "name": "OPENAI_API_KEY",
                "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
                "value": "sk-test",
                "allowedDomains": ["api.openai.com", "*.openai.azure.com"]
              }
            ]"#,
        )?;

        assert_eq!(table.len(), 1);
        assert!(table
            .by_placeholder
            .contains_key("__DSEC_0123456789abcdef0123456789abcdef__"));
        assert!(table.sni_match_set.matches("api.openai.com"));
        assert!(table.sni_match_set.matches("eastus.openai.azure.com"));
        assert!(!table.sni_match_set.matches("openai.azure.com"));

        let secret = table
            .by_placeholder
            .get("__DSEC_0123456789abcdef0123456789abcdef__")
            .context("missing parsed secret")?;
        assert_eq!(secret.name, "OPENAI_API_KEY");
        assert_eq!(secret.value, "sk-test");
        assert!(secret.allowed_domains.matches("api.openai.com"));

        Ok(())
    }

    #[test]
    fn load_returns_empty_table_for_missing_file() -> Result<()> {
        let dir = tempfile::tempdir().context("failed to create tempdir")?;
        let table = SecretTable::load(&dir.path().join("missing.json"))?;

        assert_eq!(table.len(), 0);
        assert_eq!(table.sni_match_set.pattern_count(), 0);

        Ok(())
    }

    #[test]
    fn parse_rejects_duplicate_placeholders() {
        let contents = r#"[
          {
            "name": "A",
            "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
            "value": "first",
            "allowedDomains": ["api.openai.com"]
          },
          {
            "name": "B",
            "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
            "value": "second",
            "allowedDomains": ["api.github.com"]
          }
        ]"#;

        match SecretTable::parse(contents) {
            Ok(_) => panic!("duplicate placeholder unexpectedly parsed"),
            Err(error) => assert!(error.to_string().contains("duplicate")),
        }
    }

    #[test]
    fn parse_rejects_empty_allowed_domains() {
        let contents = r#"[
          {
            "name": "A",
            "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
            "value": "secret",
            "allowedDomains": []
          }
        ]"#;

        match SecretTable::parse(contents) {
            Ok(_) => panic!("empty allowedDomains unexpectedly parsed"),
            Err(error) => assert!(format!("{:#}", error).contains("no allowedDomains")),
        }
    }

    #[test]
    fn parse_rejects_empty_name() {
        let contents = r#"[
          {
            "name": "",
            "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
            "value": "secret",
            "allowedDomains": ["api.openai.com"]
          }
        ]"#;

        match SecretTable::parse(contents) {
            Ok(_) => panic!("empty name unexpectedly parsed"),
            Err(error) => assert!(format!("{:#}", error).contains("name cannot be empty")),
        }
    }

    #[test]
    fn parse_rejects_empty_value() {
        let contents = r#"[
          {
            "name": "A",
            "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
            "value": "",
            "allowedDomains": ["api.openai.com"]
          }
        ]"#;

        match SecretTable::parse(contents) {
            Ok(_) => panic!("empty value unexpectedly parsed"),
            Err(error) => assert!(format!("{:#}", error).contains("empty value")),
        }
    }

    #[test]
    fn parse_rejects_uppercase_hex_placeholder() {
        // Cross-service contract: front renders the nonce via Buffer.toString("hex")
        // which is always lowercase. Pin it explicitly so a future encoding change
        // surfaces here instead of as a silent no-op substitution.
        let contents = r#"[
          {
            "name": "A",
            "placeholder": "__DSEC_0123456789ABCDEF0123456789ABCDEF__",
            "value": "secret",
            "allowedDomains": ["api.openai.com"]
          }
        ]"#;

        match SecretTable::parse(contents) {
            Ok(_) => panic!("uppercase-hex placeholder unexpectedly parsed"),
            Err(error) => assert!(format!("{:#}", error).contains("invalid placeholder")),
        }
    }

    #[test]
    fn load_returns_err_on_malformed_json() -> Result<()> {
        let dir = tempfile::tempdir().context("failed to create tempdir")?;
        let path = dir.path().join("egress-secrets.json");
        fs::write(&path, "not-json").context("failed to write test file")?;

        match SecretTable::load(&path) {
            Ok(_) => anyhow::bail!("malformed JSON unexpectedly loaded"),
            Err(error) => assert!(format!("{:#}", error).contains("failed to parse")),
        }
        Ok(())
    }

    #[test]
    fn parse_rejects_invalid_placeholder() {
        let contents = r#"[
          {
            "name": "A",
            "placeholder": "__DSEC_NOT_HEX__",
            "value": "first",
            "allowedDomains": ["api.openai.com"]
          }
        ]"#;

        match SecretTable::parse(contents) {
            Ok(_) => panic!("invalid placeholder unexpectedly parsed"),
            Err(error) => assert!(format!("{:#}", error).contains("invalid placeholder")),
        }
    }
}
