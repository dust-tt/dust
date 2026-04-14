use crate::domain::{normalize_dns_name, normalize_domain_or_ip};
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
        let value = value.trim().to_ascii_lowercase();
        if let Some(suffix) = value.strip_prefix("*.") {
            let suffix = normalize_dns_name(suffix)
                .map_err(|_| anyhow!("invalid wildcard domain entry: {value}"))?;
            if suffix.split('.').count() < 2 {
                return Err(anyhow!("invalid wildcard domain entry: {value}"));
            }
            return Ok(Self::WildcardSuffix(suffix));
        }

        let value =
            normalize_domain_or_ip(&value).map_err(|_| anyhow!("invalid domain entry: {value}"))?;
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

// TODO(sandbox-egress): Add a bounded TTL cache for GCS policies to avoid reading on
// every connection.

#[cfg(test)]
mod tests {
    use super::TemporaryAllowlist;

    #[test]
    fn exact_domains_match_case_insensitively_after_parse() {
        let allowlist =
            TemporaryAllowlist::parse("Example.COM").expect("valid domain entry should parse");

        assert!(allowlist.allows("example.com", "sbx"));
        assert!(!allowlist.allows("api.example.com", "sbx"));
    }

    #[test]
    fn exact_ip_literals_are_valid_entries() {
        let allowlist = TemporaryAllowlist::parse("127.0.0.1,::ffff:127.0.0.1")
            .expect("valid IP literal entries should parse");

        assert!(allowlist.allows("127.0.0.1", "sbx"));
        assert!(allowlist.allows("::ffff:127.0.0.1", "sbx"));
    }

    #[test]
    fn wildcard_matches_subdomains_only() {
        let allowlist =
            TemporaryAllowlist::parse("*.example.com").expect("valid wildcard entry should parse");

        assert!(allowlist.allows("api.example.com", "sbx"));
        assert!(allowlist.allows("a.b.example.com", "sbx"));
        assert!(!allowlist.allows("example.com", "sbx"));
    }

    #[test]
    fn invalid_entries_fail_startup() {
        assert!(TemporaryAllowlist::parse("example.com, bad domain").is_err());
        assert!(TemporaryAllowlist::parse(" , ").is_err());
        assert!(TemporaryAllowlist::parse("*").is_err());
        assert!(TemporaryAllowlist::parse("*.*.com").is_err());
        assert!(TemporaryAllowlist::parse("*example.com").is_err());
        assert!(TemporaryAllowlist::parse(".example.com").is_err());
        assert!(TemporaryAllowlist::parse("example..com").is_err());
        assert!(TemporaryAllowlist::parse("host:443").is_err());
        assert!(TemporaryAllowlist::parse("*.com").is_err());
    }
}
