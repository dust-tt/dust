use crate::domain::normalize_dns_name;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    allowed_domains: Vec<DomainPattern>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DomainPattern {
    Exact(String),
    WildcardSuffix(String),
}

/// Per-sandbox or per-workspace policy deserialized from GCS.
impl Policy {
    pub fn allows(&self, domain: &str) -> bool {
        self.allowed_domains
            .iter()
            .any(|pattern| pattern.matches(domain))
    }
}

/// Global default allowlist parsed from `EGRESS_PROXY_ALLOWED_DOMAINS`. Domains in this list are
/// allowed for every sandbox regardless of GCS policy. Intended for infrastructure domains like
/// `dust.tt` that all sandboxes need.
#[derive(Debug, Clone)]
pub struct DefaultAllowlist {
    patterns: Vec<DomainPattern>,
}

impl DefaultAllowlist {
    pub fn parse(value: &str) -> Result<Self> {
        let mut patterns = Vec::new();

        for raw_entry in value.split(',') {
            let entry = raw_entry.trim();
            if entry.is_empty() {
                continue;
            }
            patterns.push(DomainPattern::parse_policy_entry(entry)?);
        }

        if patterns.is_empty() {
            return Err(anyhow!(
                "EGRESS_PROXY_ALLOWED_DOMAINS is set but contains no valid domain entries"
            ));
        }

        Ok(Self { patterns })
    }

    pub fn allows(&self, domain: &str) -> bool {
        self.patterns.iter().any(|pattern| pattern.matches(domain))
    }
}

impl DomainPattern {
    fn parse_policy_entry(value: &str) -> Result<Self> {
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
            normalize_dns_name(&value).map_err(|_| anyhow!("invalid domain entry: {value}"))?;
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

impl<'de> Deserialize<'de> for DomainPattern {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse_policy_entry(&value).map_err(serde::de::Error::custom)
    }
}

impl Serialize for DomainPattern {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Exact(domain) => serializer.serialize_str(domain),
            Self::WildcardSuffix(suffix) => serializer.serialize_str(&format!("*.{suffix}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DefaultAllowlist, Policy};

    #[test]
    fn policy_matches_exact_domains_case_insensitively_after_parse() {
        let policy: Policy = serde_json::from_str(
            r#"{
                "allowedDomains": ["Example.COM"]
            }"#,
        )
        .expect("valid policy should parse");

        assert!(policy.allows("example.com"));
        assert!(!policy.allows("api.example.com"));
    }

    #[test]
    fn policy_wildcard_matches_subdomains_only() {
        let policy: Policy = serde_json::from_str(
            r#"{
                "allowedDomains": ["*.example.com"]
            }"#,
        )
        .expect("valid policy should parse");

        assert!(policy.allows("api.example.com"));
        assert!(policy.allows("a.b.example.com"));
        assert!(!policy.allows("example.com"));
    }

    #[test]
    fn policy_returns_false_when_domain_is_not_allowlisted() {
        let policy: Policy = serde_json::from_str(
            r#"{
                "allowedDomains": ["api.example.com", "*.example.com"]
            }"#,
        )
        .expect("valid policy should parse");

        assert!(policy.allows("api.example.com"));
        assert!(policy.allows("other.example.com"));
        assert!(!policy.allows("dust.tt"));
    }

    #[test]
    fn default_allowlist_matches_exact_and_wildcard_domains() {
        let allowlist =
            DefaultAllowlist::parse("dust.tt, *.dust.tt").expect("valid entries should parse");

        assert!(allowlist.allows("dust.tt"));
        assert!(allowlist.allows("eu.dust.tt"));
        assert!(allowlist.allows("app.eu.dust.tt"));
        assert!(!allowlist.allows("example.com"));
    }

    #[test]
    fn default_allowlist_rejects_ip_literals() {
        assert!(DefaultAllowlist::parse("127.0.0.1").is_err());
        assert!(DefaultAllowlist::parse("::1").is_err());
        assert!(DefaultAllowlist::parse("dust.tt, 10.0.0.1").is_err());
    }

    #[test]
    fn default_allowlist_rejects_empty_input() {
        assert!(DefaultAllowlist::parse("").is_err());
        assert!(DefaultAllowlist::parse(" , ").is_err());
    }

    #[test]
    fn default_allowlist_rejects_invalid_entries() {
        assert!(DefaultAllowlist::parse("*.com").is_err());
        assert!(DefaultAllowlist::parse("example..com").is_err());
        assert!(DefaultAllowlist::parse("bad domain").is_err());
    }

    #[test]
    fn policy_rejects_invalid_entries_during_deserialization() {
        for domain in [
            "127.0.0.1",
            "::1",
            "*",
            "*.*.com",
            "*example.com",
            ".example.com",
            "example..com",
            "host:443",
            "*.com",
        ] {
            let policy = format!(
                r#"{{
                    "allowedDomains": ["{domain}"]
                }}"#
            );
            assert!(
                serde_json::from_str::<Policy>(&policy).is_err(),
                "{domain} should be rejected"
            );
        }
    }
}
