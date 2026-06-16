import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";

// Private, loopback, link-local, multicast, CGNAT, and NAT64 ranges that
// must never be reachable from a user-supplied URL.
const BLOCKED_IPV4 = new BlockList();
BLOCKED_IPV4.addSubnet("0.0.0.0", 8, "ipv4"); // "This" network
BLOCKED_IPV4.addSubnet("10.0.0.0", 8, "ipv4"); // RFC 1918
BLOCKED_IPV4.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT (RFC 6598)
BLOCKED_IPV4.addSubnet("127.0.0.0", 8, "ipv4"); // Loopback
BLOCKED_IPV4.addSubnet("169.254.0.0", 16, "ipv4"); // Link-local / cloud metadata
BLOCKED_IPV4.addSubnet("172.16.0.0", 12, "ipv4"); // RFC 1918
BLOCKED_IPV4.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
BLOCKED_IPV4.addSubnet("192.168.0.0", 16, "ipv4"); // RFC 1918
BLOCKED_IPV4.addSubnet("198.18.0.0", 15, "ipv4"); // Benchmarking
BLOCKED_IPV4.addSubnet("224.0.0.0", 4, "ipv4"); // Multicast
BLOCKED_IPV4.addSubnet("240.0.0.0", 4, "ipv4"); // Reserved
BLOCKED_IPV4.addAddress("255.255.255.255", "ipv4"); // Broadcast

const BLOCKED_IPV6 = new BlockList();
BLOCKED_IPV6.addAddress("::1", "ipv6"); // Loopback
BLOCKED_IPV6.addSubnet("fc00::", 7, "ipv6"); // Unique local (fc00::/7 covers fc00:: and fd00::)
BLOCKED_IPV6.addSubnet("fe80::", 10, "ipv6"); // Link-local
BLOCKED_IPV6.addSubnet("ff00::", 8, "ipv6"); // Multicast
BLOCKED_IPV6.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64 (RFC 6052)
BLOCKED_IPV6.addSubnet("::ffff:0:0", 96, "ipv6"); // IPv4-mapped (e.g. ::ffff:127.0.0.1)
BLOCKED_IPV6.addSubnet("::ffff:0:0:0", 96, "ipv6"); // IPv4-translated

function isPrivateIp(address: string, family: 4 | 6): boolean {
  if (family === 4) {
    return BLOCKED_IPV4.check(address, "ipv4");
  }
  return BLOCKED_IPV6.check(address, "ipv6");
}

/**
 * Validates that a URL is safe to fetch server-side: must use HTTP(S) and must
 * not resolve to a private/reserved IP. Returns an error message string on
 * failure, or null on success.
 *
 * Note: this does not pin the resolved IP for the subsequent connection, so it
 * does not fully prevent DNS rebinding. It does block the common static-address
 * SSRF attacks (169.254.169.254, 10.x.x.x, etc.).
 */
export async function validateExternalUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL format.";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Only HTTP(S) URLs are allowed.";
  }

  const hostname = parsed.hostname;
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return "Could not resolve hostname.";
  }

  if (addresses.length === 0) {
    return "Hostname resolved to no addresses.";
  }

  for (const { address, family } of addresses) {
    if (family !== 4 && family !== 6) {
      return "URL resolves to an unsupported address family.";
    }
    if (isPrivateIp(address, family)) {
      return "URL resolves to a private or reserved IP address.";
    }
  }

  return null;
}
