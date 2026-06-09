use std::fs;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::process::Command;

use anyhow::Result;
use serde::Serialize;
use tracing::warn;

#[derive(clap::Args, Debug, Clone)]
pub struct HealthcheckArgs {
    /// Local forwarder TCP listen address in host:port form
    #[arg(long, default_value = "127.0.0.1:9990")]
    forwarder_listen: SocketAddr,
    /// Local resolver UDP/TCP listen address in host:port form
    #[arg(long, default_value = "127.0.0.1:1053")]
    resolver_listen: SocketAddr,
    /// UID whose egress must be forced through local services. Required;
    /// front passes this explicitly so there is no implicit-default rot.
    #[arg(long)]
    proxied_uid: u32,
    /// Merged MITM trust bundle path
    #[arg(long, default_value = "/etc/dust/ca-bundle.pem")]
    ca_bundle: PathBuf,
    /// Marker written after the merged MITM trust bundle is installed
    #[arg(long, default_value = "/etc/dust/.ca-bundle.merged")]
    ca_bundle_marker: PathBuf,
}

#[derive(Debug, Serialize)]
struct EgressHealthcheck {
    forwarder_port_ok: bool,
    resolver_udp_ok: bool,
    resolver_tcp_ok: bool,
    // DNS-specific redirects to the local resolver.
    nft_dns_udp_redirect_ok: bool,
    nft_dns_tcp_redirect_ok: bool,
    nft_dns_udp_accept_ok: bool,
    // Broader no-loopback-SSH / no-UDP / no-IPv6 / TCP-via-forwarder invariant.
    // Validating only the DNS rules would let a partially damaged ruleset pass
    // health while reopening non-53 UDP, IPv6, or local sshd access, so the
    // runtime check mirrors the full enforcement set.
    nft_tcp_forward_redirect_ok: bool,
    nft_loopback_ssh_drop_ok: bool,
    nft_udp_drop_ok: bool,
    nft_icmp_drop_ok: bool,
    nft_ipv6_drop_ok: bool,
    bundle_ok: bool,
    ok: bool,
}

pub fn cmd_healthcheck(args: HealthcheckArgs) -> Result<()> {
    let result = run_healthcheck(&args);
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}

fn run_healthcheck(args: &HealthcheckArgs) -> EgressHealthcheck {
    let forwarder_port_ok = socket_listening("/proc/net/tcp", args.forwarder_listen, Some("0A"));
    let resolver_udp_ok = socket_listening("/proc/net/udp", args.resolver_listen, None);
    let resolver_tcp_ok = socket_listening("/proc/net/tcp", args.resolver_listen, Some("0A"));
    let bundle_ok = file_nonempty(&args.ca_bundle) && args.ca_bundle_marker.is_file();

    let ipv4_rules = nft_ruleset("ip");
    let ipv6_rules = nft_ruleset("ip6");
    let dns_stub_port = args.resolver_listen.port();
    let forwarder_port = args.forwarder_listen.port();
    let uid_rule = |rules: &Option<String>, fragment: &str| {
        rules
            .as_deref()
            .map(|r| contains_uid_rule(r, args.proxied_uid, fragment))
            .unwrap_or(false)
    };

    let nft_dns_udp_redirect_ok = uid_rule(
        &ipv4_rules,
        &format!("udp dport 53 redirect to :{dns_stub_port}"),
    );
    let nft_dns_tcp_redirect_ok = uid_rule(
        &ipv4_rules,
        &format!("tcp dport 53 redirect to :{dns_stub_port}"),
    );
    let nft_dns_udp_accept_ok = uid_rule(
        &ipv4_rules,
        &format!("ip daddr 127.0.0.1 udp dport {dns_stub_port} accept"),
    );
    let nft_tcp_forward_redirect_ok = uid_rule(
        &ipv4_rules,
        &format!("tcp dport != 0 redirect to :{forwarder_port}"),
    );
    let nft_loopback_ssh_drop_ok = uid_rule(&ipv4_rules, "ip daddr 127.0.0.0/8 tcp dport 22 drop");
    // `nft list` may print `meta l4proto` matches either by name (`udp`,
    // `icmp`) or by IANA protocol number (17, 1). Accept both so the check
    // works regardless of how nft prints the ruleset on a given kernel/nft
    // version.
    let nft_udp_drop_ok = uid_rule(&ipv4_rules, "meta l4proto 17 drop")
        || uid_rule(&ipv4_rules, "meta l4proto udp drop");
    let nft_icmp_drop_ok = uid_rule(&ipv4_rules, "meta l4proto 1 drop")
        || uid_rule(&ipv4_rules, "meta l4proto icmp drop");
    // The ip6 table has a single catch-all drop for the proxied uid; match on
    // the bare `drop` verdict scoped to that uid.
    let nft_ipv6_drop_ok = uid_rule(&ipv6_rules, "drop");

    let ok = forwarder_port_ok
        && resolver_udp_ok
        && resolver_tcp_ok
        && nft_dns_udp_redirect_ok
        && nft_dns_tcp_redirect_ok
        && nft_dns_udp_accept_ok
        && nft_tcp_forward_redirect_ok
        && nft_loopback_ssh_drop_ok
        && nft_udp_drop_ok
        && nft_icmp_drop_ok
        && nft_ipv6_drop_ok
        && bundle_ok;

    EgressHealthcheck {
        forwarder_port_ok,
        resolver_udp_ok,
        resolver_tcp_ok,
        nft_dns_udp_redirect_ok,
        nft_dns_tcp_redirect_ok,
        nft_dns_udp_accept_ok,
        nft_tcp_forward_redirect_ok,
        nft_loopback_ssh_drop_ok,
        nft_udp_drop_ok,
        nft_icmp_drop_ok,
        nft_ipv6_drop_ok,
        bundle_ok,
        ok,
    }
}

fn socket_listening(proc_path: &str, addr: SocketAddr, required_state: Option<&str>) -> bool {
    let Some(local_addr) = proc_net_ipv4_addr(addr) else {
        return false;
    };
    let Ok(contents) = fs::read_to_string(proc_path) else {
        return false;
    };

    contents.lines().skip(1).any(|line| {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        let local_matches = fields.get(1).copied() == Some(local_addr.as_str());
        let state_matches = required_state
            .map(|state| fields.get(3).copied() == Some(state))
            .unwrap_or(true);
        local_matches && state_matches
    })
}

fn proc_net_ipv4_addr(addr: SocketAddr) -> Option<String> {
    let IpAddr::V4(ip) = addr.ip() else {
        return None;
    };
    let octets = ip.octets();
    Some(format!(
        "{:02X}{:02X}{:02X}{:02X}:{:04X}",
        octets[3],
        octets[2],
        octets[1],
        octets[0],
        addr.port()
    ))
}

fn file_nonempty(path: &PathBuf) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false)
}

fn nft_ruleset(family: &str) -> Option<String> {
    // Any failure path here surfaces to the caller as `nft_*_ok: false`
    // (enforcement reads as missing), which is the right safety posture.
    // Log the reason on stderr so we don't lose the diagnostic.
    let output = match Command::new("nft")
        .args(["-n", "list", "table", family, "dust-egress"])
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            warn!(error = %error, family = family, "failed to invoke nft for healthcheck");
            return None;
        }
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!(
            exit_code = ?output.status.code(),
            stderr = %stderr,
            family = family,
            "nft list table dust-egress exited non-zero"
        );
        return None;
    }
    match String::from_utf8(output.stdout) {
        Ok(rules) => Some(rules),
        Err(error) => {
            warn!(error = %error, family = family, "nft stdout was not valid UTF-8");
            None
        }
    }
}

fn contains_uid_rule(rules: &str, proxied_uid: u32, fragment: &str) -> bool {
    let uid_fragment = format!("skuid {proxied_uid}");
    rules
        .lines()
        .any(|line| line.contains(&uid_fragment) && line.contains(fragment))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_ipv4_socket_for_proc_net() {
        let addr = match "127.0.0.1:1053".parse::<SocketAddr>() {
            Ok(addr) => addr,
            Err(error) => panic!("valid addr: {error}"),
        };

        assert_eq!(proc_net_ipv4_addr(addr).as_deref(), Some("0100007F:041D"));
    }

    #[test]
    fn rejects_ipv6_proc_net_socket_format() {
        let addr = match "[::1]:1053".parse::<SocketAddr>() {
            Ok(addr) => addr,
            Err(error) => panic!("valid addr: {error}"),
        };

        assert_eq!(proc_net_ipv4_addr(addr), None);
    }

    #[test]
    fn matches_uid_scoped_nft_rule_fragments() {
        let rules = r#"
table ip dust-egress {
  chain nat_output {
    type nat hook output priority dstnat; policy accept;
    meta skuid 1003 udp dport 53 redirect to :1053
    meta skuid 1003 tcp dport 53 redirect to :1053
  }
  chain filter_output {
    type filter hook output priority 0; policy accept;
    meta skuid 1003 ip daddr 127.0.0.0/8 tcp dport 22 drop
  }
}
"#;

        assert!(contains_uid_rule(
            rules,
            1003,
            "udp dport 53 redirect to :1053"
        ));
        assert!(!contains_uid_rule(
            rules,
            1004,
            "udp dport 53 redirect to :1053"
        ));
        assert!(contains_uid_rule(
            rules,
            1003,
            "ip daddr 127.0.0.0/8 tcp dport 22 drop"
        ));
    }

    // `nft list table` normalizes `meta l4proto udp` to `meta l4proto 17`
    // (and `icmp` to `1`) even though the install script writes the named
    // form. The healthcheck accepts both so the verification doesn't depend
    // on the printer's choice.
    #[test]
    fn matches_meta_l4proto_drops_in_numeric_form() {
        let rules = r#"
table ip dust-egress {
  chain filter_output {
    type filter hook output priority 0; policy accept;
    meta skuid 1003 meta l4proto 17 drop
    meta skuid 1003 meta l4proto 1 drop
  }
}
"#;

        assert!(contains_uid_rule(rules, 1003, "meta l4proto 17 drop"));
        assert!(contains_uid_rule(rules, 1003, "meta l4proto 1 drop"));
        assert!(!contains_uid_rule(rules, 1003, "meta l4proto udp drop"));
        assert!(!contains_uid_rule(rules, 1003, "meta l4proto icmp drop"));
    }

    #[test]
    fn matches_meta_l4proto_drops_in_named_form() {
        let rules = r#"
table ip dust-egress {
  chain filter_output {
    type filter hook output priority 0; policy accept;
    meta skuid 1003 meta l4proto udp drop
    meta skuid 1003 meta l4proto icmp drop
  }
}
"#;

        assert!(contains_uid_rule(rules, 1003, "meta l4proto udp drop"));
        assert!(contains_uid_rule(rules, 1003, "meta l4proto icmp drop"));
    }
}
