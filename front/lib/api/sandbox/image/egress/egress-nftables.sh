#!/bin/bash
set -eu

CONTROLLED_UIDS="1002 1003"
DNS_STUB_PORT=1053
GCS_TOKEN_SERVER_PORT=987
SYSTEM_RESOLV_CONF=/run/systemd/resolve/stub-resolv.conf

# Keep the machine-wide resolver local. Service users not covered by the
# sandbox egress boundary use systemd-resolved, while controlled UIDs are
# redirected below to the synthetic resolver before reaching the local stub.
[ -s "$SYSTEM_RESOLV_CONF" ]
/bin/ln -sfn "$SYSTEM_RESOLV_CONF" /etc/resolv.conf

# Reinstall a single canonical ruleset on every sandbox boot.
/usr/sbin/nft delete table ip dust-egress 2>/dev/null || true
/usr/sbin/nft delete table ip6 dust-egress 2>/dev/null || true

/usr/sbin/nft add table ip dust-egress
/usr/sbin/nft add chain ip dust-egress nat_output '{ type nat hook output priority -100 ; policy accept ; }'
/usr/sbin/nft add chain ip dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'

# nat/OUTPUT runs before filter/OUTPUT for locally generated packets.
/usr/sbin/nft add table ip6 dust-egress
/usr/sbin/nft add chain ip6 dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'

for CONTROLLED_UID in $CONTROLLED_UIDS; do
  # DNS interception must run before loopback/private exemptions and before
  # the broad TCP redirect so every port-53 packet lands on the local stub.
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID udp dport 53 redirect to :$DNS_STUB_PORT
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID tcp dport 53 redirect to :$DNS_STUB_PORT

  # Other exemptions must land in nat before the broad TCP redirect so filter
  # drops still see the original destination. The 127.0.0.0/8 return is
  # load-bearing for the loopback SSH drop below: without it the broad TCP
  # redirect would rewrite dport to 9990 before filter_output sees port 22.
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 return
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID ip daddr 169.254.169.254 return
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID ip daddr 10.0.0.0/8 return
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID ip daddr 172.16.0.0/12 return
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID ip daddr 192.168.0.0/16 return
  /usr/sbin/nft add rule ip dust-egress nat_output meta skuid $CONTROLLED_UID tcp dport != 0 redirect to :9990

  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.1 udp dport $DNS_STUB_PORT accept
  # The GCS token broker serves live bearer credentials. Keep every
  # Front-controlled non-root UID out.
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 tcp dport $GCS_TOKEN_SERVER_PORT drop
  # Loopback SSH kill switch: the image masks sshd, this drops controlled UIDs
  # to local tcp/22 in case anything restores it. IPv6 ::1:22 is covered by
  # the catch-all ip6 drop below.
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 tcp dport 22 drop
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 169.254.169.254 drop
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 10.0.0.0/8 drop
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 172.16.0.0/12 drop
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID ip daddr 192.168.0.0/16 drop
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID meta l4proto udp drop
  /usr/sbin/nft add rule ip dust-egress filter_output meta skuid $CONTROLLED_UID meta l4proto icmp drop
  /usr/sbin/nft add rule ip6 dust-egress filter_output meta skuid $CONTROLLED_UID drop
done
