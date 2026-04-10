use anyhow::{anyhow, Result};

#[derive(Debug, Clone)]
pub struct TemporaryAllowlist {
    patterns: Vec<DomainPattern>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DomainPattern {
    Exact(String),
    WildcardSuffix(String),
}

impl TemporaryAllowlist {
    pub fn parse(value: &str) -> Result<Self> {
        let mut patterns = Vec::new();

        for raw_entry in value.split(',') {
            let entry = raw_entry.trim();
            if entry.is_empty() {
                continue;
            }
            patterns.push(DomainPattern::parse(entry)?);
        }

        if patterns.is_empty() {
            return Err(anyhow!("EGRESS_PROXY_ALLOWED_DOMAINS must not be empty"));
        }

        Ok(Self { patterns })
    }

    pub fn allows(&self, domain: &str, sb_id: &str) -> bool {
        // TODO(sandbox-egress): Replace this static env allowlist with the GCS-backed
        // per-sandbox policy provider. The production policy source is
        // gs://<regional-sandbox-egress-policies>/policies/{sbId}.json.

        // TODO(sandbox-egress): Use sb_id to fetch policies/{sbId}.json from GCS. PR 1 uses
        // the same temporary allowlist for every sandbox so we can validate the proxy protocol
        // independently from front and GCS integration.
        let _ = sb_id;

        self.patterns.iter().any(|pattern| pattern.matches(domain))
    }
}

impl DomainPattern {
    fn parse(value: &str) -> Result<Self> {
        // TODO(sandbox-egress): Replace the minimal domain allowlist with the full policy schema
        // (defaultAction + rules) once front starts writing policy files.
        let value = normalize_policy_domain(value)?;
        if let Some(suffix) = value.strip_prefix("*.") {
            if suffix.is_empty() {
                return Err(anyhow!("invalid wildcard domain entry: {value}"));
            }
            return Ok(Self::WildcardSuffix(suffix.to_string()));
        }

        Ok(Self::Exact(value))
    }

    fn matches(&self, domain: &str) -> bool {
        match self {
            Self::Exact(exact) => domain == exact,
            Self::WildcardSuffix(suffix) => {
                domain.ends_with(suffix)
                    && domain.len() > suffix.len()
                    && domain.as_bytes()[domain.len() - suffix.len() - 1] == b'.'
            }
        }
    }
}

fn normalize_policy_domain(value: &str) -> Result<String> {
    let value = value.trim().to_lowercase();
    let value = value.strip_suffix('.').unwrap_or(&value).to_string();

    if value.is_empty() {
        return Err(anyhow!("domain entry must not be empty"));
    }

    if value
        .bytes()
        .any(|byte| byte.is_ascii_control() || byte == b'\0' || byte == b' ' || byte == b'/')
    {
        return Err(anyhow!("invalid domain entry: {value}"));
    }

    Ok(value)
}

// TODO(sandbox-egress): Add a bounded TTL cache for GCS policies to avoid reading on
// every connection.

#[cfg(test)]
mod tests {
    use super::TemporaryAllowlist;

    #[test]
    fn exact_domains_match_case_insensitively_after_parse() {
        let allowlist = TemporaryAllowlist::parse("Example.COM").unwrap();

        assert!(allowlist.allows("example.com", "sbx"));
        assert!(!allowlist.allows("api.example.com", "sbx"));
    }

    #[test]
    fn wildcard_matches_subdomains_only() {
        let allowlist = TemporaryAllowlist::parse("*.example.com").unwrap();

        assert!(allowlist.allows("api.example.com", "sbx"));
        assert!(allowlist.allows("a.b.example.com", "sbx"));
        assert!(!allowlist.allows("example.com", "sbx"));
    }

    #[test]
    fn invalid_entries_fail_startup() {
        assert!(TemporaryAllowlist::parse("example.com, bad domain").is_err());
        assert!(TemporaryAllowlist::parse(" , ").is_err());
    }
}
