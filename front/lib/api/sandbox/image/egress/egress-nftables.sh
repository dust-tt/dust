#!/bin/bash
set -eu

PROXIED_UID=1003
DNS_STUB_PORT=1053

# Reinstall a single canonical ruleset on every sandbox boot.
nft delete table ip dust-egress 2>/dev/null || true
nft delete table ip6 dust-egress 2>/dev/null || true

nft add table ip dust-egress
nft add chain ip dust-egress nat_output '{ type nat hook output priority -100 ; policy accept ; }'
nft add chain ip dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'

# nat/OUTPUT runs before filter/OUTPUT for locally generated packets.
# DNS interception must run before loopback/private exemptions and before the
# broad TCP redirect so every port-53 packet lands on the local stub.
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID udp dport 53 redirect to :$DNS_STUB_PORT
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID tcp dport 53 redirect to :$DNS_STUB_PORT

# Other exemptions must land in nat before the broad TCP redirect so filter
# drops still see the original destination.
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 127.0.0.0/8 return
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 169.254.169.254 return
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 10.0.0.0/8 return
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 172.16.0.0/12 return
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 192.168.0.0/16 return
nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID tcp dport != 0 redirect to :9990

nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 127.0.0.1 udp dport $DNS_STUB_PORT accept
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 127.0.0.0/8 tcp dport 22 drop
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 169.254.169.254 drop
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 10.0.0.0/8 drop
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 172.16.0.0/12 drop
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 192.168.0.0/16 drop
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID meta l4proto udp drop
nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID meta l4proto icmp drop

nft add table ip6 dust-egress
nft add chain ip6 dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'
nft add rule ip6 dust-egress filter_output meta skuid $PROXIED_UID drop
