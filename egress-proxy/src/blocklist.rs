use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

const GLOBAL_BLOCKED_DOMAINS: &[&str] = &[
    // TODO(sandbox-egress): Move this list to the final managed policy/config path if we
    // need runtime updates without redeploying the proxy.
    "dns.google",
    "dns.google.com",
    "cloudflare-dns.com",
    "one.one.one.one",
    "1.1.1.1",
    "1.0.0.1",
    "dns.quad9.net",
    "doh.opendns.com",
    "dns.nextdns.io",
];

pub fn is_globally_blocked_domain(domain: &str) -> bool {
    // TODO(sandbox-egress): Nice-to-have policy decision before GCS policies ship: decide
    // whether global blocklist entries need suffix matching for provider-controlled subdomains.
    GLOBAL_BLOCKED_DOMAINS.contains(&domain)
}

pub fn is_unsafe_ip(ip: IpAddr) -> bool {
    // TODO(sandbox-egress): Add stable deny reason metrics for each blocked IP category.
    match ip {
        IpAddr::V4(ip) => is_unsafe_ipv4(ip),
        IpAddr::V6(ip) => is_unsafe_ipv6(ip),
    }
}

fn is_unsafe_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || is_shared_ipv4(ip)
        || is_documentation_ipv4(ip)
        || is_benchmarking_ipv4(ip)
        || is_class_e_ipv4(ip)
        // Explicitly block the well-known cloud metadata service address. This is already covered
        // by the link-local check above, but keeping it visible documents the SSRF risk.
        || ip == Ipv4Addr::new(169, 254, 169, 254)
}

// RFC 6890/5737 documentation and protocol-assignment ranges — never globally routable.
fn is_documentation_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, ..] = ip.octets();
    (a == 192 && b == 0 && c == 0)       // 192.0.0.0/24   IETF Protocol Assignments (RFC 6890)
        || (a == 192 && b == 0 && c == 2)    // 192.0.2.0/24   TEST-NET-1 (RFC 5737)
        || (a == 198 && b == 51 && c == 100) // 198.51.100.0/24 TEST-NET-2 (RFC 5737)
        || (a == 203 && b == 0 && c == 113) // 203.0.113.0/24  TEST-NET-3 (RFC 5737)
}

// RFC 2544 benchmarking range — not for production traffic.
fn is_benchmarking_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 198 && (b == 18 || b == 19) // 198.18.0.0/15
}

// Class E (240.0.0.0/4) — reserved by IANA, never globally routable.
fn is_class_e_ipv4(ip: Ipv4Addr) -> bool {
    ip.octets()[0] >= 240
}

fn is_unsafe_ipv6(ip: Ipv6Addr) -> bool {
    // Check native IPv6 addresses first because `extract_embedded_ipv4` maps `::1` to `0.0.0.1`.
    ip.is_loopback()
        || ip.is_unspecified()
        || is_unique_local_ipv6(ip)
        || is_unicast_link_local(ip)
        || extract_embedded_ipv4(ip).is_some_and(is_unsafe_ipv4)
}

fn is_shared_ipv4(ip: Ipv4Addr) -> bool {
    let [first, second, ..] = ip.octets();
    // RFC 6598 shared address space (100.64.0.0/10) is not globally routable.
    first == 100 && (second & 0xc0) == 0x40
}

fn extract_embedded_ipv4(ip: Ipv6Addr) -> Option<Ipv4Addr> {
    // Reachability still depends on the host network having the corresponding translator or
    // tunnel. Classify the standardized encodings here so a routing change cannot weaken the
    // proxy's SSRF boundary.
    if let Some(ipv4) = ip.to_ipv4() {
        return Some(ipv4);
    }

    match ip.octets() {
        // 6to4 (2002::/16) embeds the IPv4 destination immediately after the prefix.
        [0x20, 0x02, a, b, c, d, ..] => Some(Ipv4Addr::new(a, b, c, d)),
        // NAT64's well-known prefix (64:ff9b::/96) embeds the IPv4 destination at the end.
        [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0, a, b, c, d] => {
            Some(Ipv4Addr::new(a, b, c, d))
        }
        // NAT64's local well-known prefix (64:ff9b:1::/48, RFC 8215): operator assigns /96
        // subnets within this range; IPv4 is always in the last 32 bits.
        [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01, _, _, _, _, _, _, a, b, c, d] => {
            Some(Ipv4Addr::new(a, b, c, d))
        }
        // Teredo (2001:0000::/32) stores the client IPv4 destination bitwise-inverted at the end.
        [0x20, 0x01, 0, 0, _, _, _, _, _, _, _, _, a, b, c, d] => {
            Some(Ipv4Addr::new(!a, !b, !c, !d))
        }
        _ => None,
    }
}

fn is_unique_local_ipv6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

fn is_unicast_link_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xffc0) == 0xfe80
}

#[cfg(test)]
mod tests {
    use super::{extract_embedded_ipv4, is_globally_blocked_domain, is_unsafe_ip};
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    #[test]
    fn blocks_doh_domains() {
        assert!(is_globally_blocked_domain("dns.google"));
        assert!(is_globally_blocked_domain("1.1.1.1"));
        assert!(!is_globally_blocked_domain("example.com"));
    }

    #[test]
    fn classifies_unsafe_ips() {
        for ipv4 in [
            Ipv4Addr::new(127, 0, 0, 1),
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(100, 100, 100, 200),
            Ipv4Addr::new(169, 254, 169, 254),
        ] {
            assert!(is_unsafe_ip(IpAddr::V4(ipv4)));
            assert!(is_unsafe_ip(IpAddr::V6(ipv4.to_ipv6_mapped())));
            assert!(is_unsafe_ip(IpAddr::V6(ipv4.to_ipv6_compatible())));
        }

        assert!(is_unsafe_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));

        let public_ipv4 = Ipv4Addr::new(93, 184, 216, 34);
        assert!(!is_unsafe_ip(IpAddr::V4(public_ipv4)));
        assert!(!is_unsafe_ip(IpAddr::V6(public_ipv4.to_ipv6_mapped())));
        assert!(!is_unsafe_ip(IpAddr::V6(public_ipv4.to_ipv6_compatible())));
    }

    #[test]
    fn classifies_ipv6_transition_addresses_by_their_embedded_ipv4() {
        for (value, expected) in [
            ("::ffff:127.0.0.1", Ipv4Addr::new(127, 0, 0, 1)),
            ("::127.0.0.1", Ipv4Addr::new(127, 0, 0, 1)),
            ("64:ff9b::a9fe:a9fe", Ipv4Addr::new(169, 254, 169, 254)),
            ("2002:c0a8:101::", Ipv4Addr::new(192, 168, 1, 1)),
            (
                "2001:0:dead:beef:0:ffff:80ff:fffe",
                Ipv4Addr::new(127, 0, 0, 1),
            ),
        ] {
            let ip = value
                .parse::<Ipv6Addr>()
                .expect("transition address should be valid IPv6");
            assert_eq!(extract_embedded_ipv4(ip), Some(expected), "{value}");
            assert!(is_unsafe_ip(IpAddr::V6(ip)), "{value}");
        }

        for (value, expected) in [
            ("64:ff9b::5db8:d822", Ipv4Addr::new(93, 184, 216, 34)),
            ("2002:5db8:d822::", Ipv4Addr::new(93, 184, 216, 34)),
            (
                "2001:0:dead:beef:0:ffff:a247:27dd",
                Ipv4Addr::new(93, 184, 216, 34),
            ),
        ] {
            let ip = value
                .parse::<Ipv6Addr>()
                .expect("transition address should be valid IPv6");
            assert_eq!(extract_embedded_ipv4(ip), Some(expected), "{value}");
            assert!(!is_unsafe_ip(IpAddr::V6(ip)), "{value}");
        }
    }

    #[test]
    fn blocks_shared_ipv4_space() {
        for value in ["100.64.0.0", "100.100.100.200", "100.127.255.255"] {
            let ip = value
                .parse::<Ipv4Addr>()
                .expect("shared address should be valid IPv4");
            assert!(is_unsafe_ip(IpAddr::V4(ip)), "{value}");
        }

        for value in ["100.63.255.255", "100.128.0.0"] {
            let ip = value
                .parse::<Ipv4Addr>()
                .expect("public address should be valid IPv4");
            assert!(!is_unsafe_ip(IpAddr::V4(ip)), "{value}");
        }
    }

    #[test]
    fn blocks_reserved_ipv4_ranges() {
        for value in [
            "192.0.0.1",       // IETF Protocol Assignments (RFC 6890)
            "192.0.2.1",       // TEST-NET-1 (RFC 5737)
            "198.51.100.1",    // TEST-NET-2 (RFC 5737)
            "203.0.113.1",     // TEST-NET-3 (RFC 5737)
            "198.18.0.1",      // benchmarking (RFC 2544)
            "198.19.255.255",  // benchmarking (RFC 2544)
            "240.0.0.1",       // Class E
            "255.255.255.255", // broadcast
        ] {
            let ip = value
                .parse::<Ipv4Addr>()
                .expect("reserved address should be valid IPv4");
            assert!(is_unsafe_ip(IpAddr::V4(ip)), "{value}");
        }

        // Adjacent public addresses must not be blocked.
        for value in ["192.0.3.1", "198.20.0.1", "239.255.255.255"] {
            let ip = value
                .parse::<Ipv4Addr>()
                .expect("public address should be valid IPv4");
            assert!(!is_unsafe_ip(IpAddr::V4(ip)), "{value}");
        }
    }

    #[test]
    fn blocks_nat64_local_prefix() {
        // 64:ff9b:1::/48 with a private IPv4 at the end (10.0.0.1).
        let ip = "64:ff9b:1::a00:1"
            .parse::<Ipv6Addr>()
            .expect("NAT64 local address should be valid IPv6");
        assert!(is_unsafe_ip(IpAddr::V6(ip)), "NAT64 local + private IPv4");

        // 64:ff9b:1::/48 with a public IPv4 at the end (93.184.216.34).
        let ip = "64:ff9b:1::5db8:d822"
            .parse::<Ipv6Addr>()
            .expect("NAT64 local address should be valid IPv6");
        assert!(!is_unsafe_ip(IpAddr::V6(ip)), "NAT64 local + public IPv4");
    }
}
