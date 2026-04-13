use std::net::IpAddr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DomainValidationError {
    Empty,
    Invalid,
}

pub fn normalize_domain_or_ip(value: &str) -> Result<String, DomainValidationError> {
    let value = value.to_ascii_lowercase();
    let value = value.strip_suffix('.').unwrap_or(&value).to_string();

    if value.is_empty() {
        return Err(DomainValidationError::Empty);
    }

    if value.parse::<IpAddr>().is_ok() {
        return Ok(value);
    }

    if is_valid_dns_name(&value) {
        return Ok(value);
    }

    Err(DomainValidationError::Invalid)
}

pub fn normalize_dns_name(value: &str) -> Result<String, DomainValidationError> {
    let value = normalize_domain_or_ip(value)?;
    if value.parse::<IpAddr>().is_ok() {
        return Err(DomainValidationError::Invalid);
    }
    Ok(value)
}

fn is_valid_dns_name(value: &str) -> bool {
    // A DNS name is at most 255 octets on the wire including the root terminator. We normalize
    // away a trailing dot above, so the presentation form here is capped at 253 characters.
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
    use super::{normalize_dns_name, normalize_domain_or_ip};

    #[test]
    fn normalizes_dns_names_and_ip_literals() {
        assert_eq!(
            normalize_domain_or_ip("Example.COM.")
                .expect("mixed-case DNS name should normalize successfully"),
            "example.com"
        );
        assert_eq!(
            normalize_domain_or_ip("127.0.0.1").expect("IPv4 literal should be accepted"),
            "127.0.0.1"
        );
        assert_eq!(
            normalize_domain_or_ip("::ffff:127.0.0.1").expect("IPv6 literal should be accepted"),
            "::ffff:127.0.0.1"
        );
        assert_eq!(
            normalize_dns_name("LOCALHOST")
                .expect("DNS-only normalization should accept hostnames"),
            "localhost"
        );
    }

    #[test]
    fn rejects_malformed_dns_names() {
        for value in [
            "*",
            "*.*.com",
            "*example.com",
            ".example.com",
            "example..com",
            "host:443",
            "bad domain",
            " example.com",
            "ex_ample.com",
            "éxample.com",
            "-example.com",
            "example-.com",
        ] {
            assert!(normalize_domain_or_ip(value).is_err(), "{value}");
        }
    }

    #[test]
    fn rejects_ip_literals_for_dns_only_validation() {
        assert!(normalize_dns_name("127.0.0.1").is_err());
        assert!(normalize_dns_name("::1").is_err());
    }
}
