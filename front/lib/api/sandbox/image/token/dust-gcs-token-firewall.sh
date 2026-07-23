#!/bin/bash
set -euo pipefail

# Keep the root-owned token broker inaccessible to every Front-controlled
# non-root uid even when dev-unrestricted egress tears down the regular
# dust-egress nftables table. The lock and existence checks make concurrent
# lifecycle/mount setup calls converge without a gap.
CONTROLLED_UIDS="1002 1003"

/usr/bin/install -d -o root -g root -m 700 /run/dust-gcs
exec 9>/run/dust-gcs/firewall.lock
/usr/bin/flock -x 9

if ! /usr/sbin/nft list table ip dust-gcs-token >/dev/null 2>&1; then
  /usr/sbin/nft add table ip dust-gcs-token
fi
if ! /usr/sbin/nft list chain ip dust-gcs-token filter_output >/dev/null 2>&1; then
  /usr/sbin/nft add chain ip dust-gcs-token filter_output '{ type filter hook output priority 0 ; policy accept ; }'
fi
rules="$(/usr/sbin/nft list chain ip dust-gcs-token filter_output 2>/dev/null || true)"
for CONTROLLED_UID in $CONTROLLED_UIDS; do
  expected_rule="meta skuid $CONTROLLED_UID ip daddr 127.0.0.0/8 tcp dport 987 drop"
  if ! /usr/bin/grep -Fq "$expected_rule" <<<"$rules"; then
    /usr/sbin/nft add rule ip dust-gcs-token filter_output meta skuid "$CONTROLLED_UID" ip daddr 127.0.0.0/8 tcp dport 987 drop
  fi
done
