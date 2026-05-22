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
    nft_dns_udp_redirect_ok: bool,
    nft_dns_tcp_redirect_ok: bool,
    nft_dns_udp_accept_ok: bool,
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

    let nft_rules = nft_ipv4_ruleset();
    let dns_stub_port = args.resolver_listen.port();
    let nft_dns_udp_redirect_ok = nft_rules
        .as_deref()
        .map(|rules| {
            contains_uid_rule(
                rules,
                args.proxied_uid,
                &format!("udp dport 53 redirect to :{dns_stub_port}"),
            )
        })
        .unwrap_or(false);
    let nft_dns_tcp_redirect_ok = nft_rules
        .as_deref()
        .map(|rules| {
            contains_uid_rule(
                rules,
                args.proxied_uid,
                &format!("tcp dport 53 redirect to :{dns_stub_port}"),
            )
        })
        .unwrap_or(false);
    let nft_dns_udp_accept_ok = nft_rules
        .as_deref()
        .map(|rules| {
            contains_uid_rule(
                rules,
                args.proxied_uid,
                &format!("ip daddr 127.0.0.1 udp dport {dns_stub_port} accept"),
            )
        })
        .unwrap_or(false);

    EgressHealthcheck {
        forwarder_port_ok,
        resolver_udp_ok,
        resolver_tcp_ok,
        nft_dns_udp_redirect_ok,
        nft_dns_tcp_redirect_ok,
        nft_dns_udp_accept_ok,
        bundle_ok,
        ok: forwarder_port_ok
            && resolver_udp_ok
            && resolver_tcp_ok
            && nft_dns_udp_redirect_ok
            && nft_dns_tcp_redirect_ok
            && nft_dns_udp_accept_ok
            && bundle_ok,
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

fn nft_ipv4_ruleset() -> Option<String> {
    // Any failure path here surfaces to the caller as `nft_dns_*_ok: false`
    // (DNS enforcement reads as missing), which is the right safety posture.
    // Log the reason on stderr so we don't lose the diagnostic.
    let output = match Command::new("nft")
        .args(["-n", "list", "table", "ip", "dust-egress"])
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            warn!(error = %error, "failed to invoke nft for healthcheck");
            return None;
        }
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!(
            exit_code = ?output.status.code(),
            stderr = %stderr,
            "nft list table ip dust-egress exited non-zero"
        );
        return None;
    }
    match String::from_utf8(output.stdout) {
        Ok(rules) => Some(rules),
        Err(error) => {
            warn!(error = %error, "nft stdout was not valid UTF-8");
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
    }
}
