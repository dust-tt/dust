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

impl Policy {
    pub fn allows(&self, domain: &str) -> bool {
        self.allowed_domains
            .iter()
            .any(|pattern| pattern.matches(domain))
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
    use super::Policy;

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
