use crate::domain::normalize_dns_name;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Deserializer};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    default_action: Action,
    rules: Vec<PolicyRule>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PolicyRule {
    domain: DomainPattern,
    action: Action,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DomainPattern {
    Exact(String),
    WildcardSuffix(String),
}

impl Policy {
    pub fn evaluate(&self, domain: &str) -> Action {
        for rule in &self.rules {
            if rule.domain.matches(domain) {
                return rule.action;
            }
        }

        self.default_action
    }
}

impl DomainPattern {
    fn parse(value: &str) -> Result<Self> {
        let value = value.trim().to_ascii_lowercase();
        if let Some(suffix) = value.strip_prefix("*.") {
            let suffix = normalize_dns_name(suffix)
                .map_err(|_| anyhow!("invalid wildcard domain entry: {value}"))?;
            if suffix.split('.').count() < 2 {
                return Err(anyhow!("invalid wildcard domain entry: {value}"));
            }
            return Ok(Self::WildcardSuffix(suffix));
        }

        let exact =
            normalize_dns_name(&value).map_err(|_| anyhow!("invalid domain entry: {value}"))?;
        Ok(Self::Exact(exact))
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
        Self::parse(&value).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::{Action, Policy};

    #[test]
    fn exact_domains_match_case_insensitively_after_parse() {
        let policy: Policy = serde_json::from_str(
            r#"{
                "defaultAction": "deny",
                "rules": [{ "domain": "Example.COM", "action": "allow" }]
            }"#,
        )
        .expect("valid policy should parse");

        assert_eq!(policy.evaluate("example.com"), Action::Allow);
        assert_eq!(policy.evaluate("api.example.com"), Action::Deny);
    }

    #[test]
    fn wildcard_matches_subdomains_only() {
        let policy: Policy = serde_json::from_str(
            r#"{
                "defaultAction": "deny",
                "rules": [{ "domain": "*.example.com", "action": "allow" }]
            }"#,
        )
        .expect("valid policy should parse");

        assert_eq!(policy.evaluate("api.example.com"), Action::Allow);
        assert_eq!(policy.evaluate("a.b.example.com"), Action::Allow);
        assert_eq!(policy.evaluate("example.com"), Action::Deny);
    }

    #[test]
    fn first_matching_rule_wins() {
        let policy: Policy = serde_json::from_str(
            r#"{
                "defaultAction": "allow",
                "rules": [
                    { "domain": "*.example.com", "action": "deny" },
                    { "domain": "api.example.com", "action": "allow" }
                ]
            }"#,
        )
        .expect("valid policy should parse");

        assert_eq!(policy.evaluate("api.example.com"), Action::Deny);
        assert_eq!(policy.evaluate("other.example.com"), Action::Deny);
        assert_eq!(policy.evaluate("dust.tt"), Action::Allow);
    }

    #[test]
    fn invalid_entries_fail_deserialization() {
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
                    "defaultAction": "deny",
                    "rules": [{{ "domain": "{domain}", "action": "allow" }}]
                }}"#
            );
            assert!(
                serde_json::from_str::<Policy>(&policy).is_err(),
                "{domain} should be rejected"
            );
        }
    }

    #[test]
    fn unknown_action_fails_deserialization() {
        assert!(serde_json::from_str::<Policy>(
            r#"{
                    "defaultAction": "deny",
                    "rules": [{ "domain": "example.com", "action": "block" }]
                }"#,
        )
        .is_err());
    }
}
