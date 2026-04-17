#!/bin/bash
set -eu

PROXIED_UID=1003

# nat/OUTPUT runs before filter/OUTPUT for locally generated packets.
# Exemptions (loopback, metadata, RFC1918) must land in nat BEFORE the
# REDIRECT — otherwise the destination is rewritten to 127.0.0.1:9990
# and filter DROPs on the original dst never fire.
iptables -t nat -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 127.0.0.0/8 -j RETURN
iptables -t nat -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 169.254.169.254/32 -j RETURN
iptables -t nat -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 10.0.0.0/8 -j RETURN
iptables -t nat -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 172.16.0.0/12 -j RETURN
iptables -t nat -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 192.168.0.0/16 -j RETURN
iptables -t nat -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -p tcp -j REDIRECT --to-ports 9990

# DNS pinned to resolvers first — resolver may itself live in RFC1918.
for NS in $(awk '/^nameserver/ {print $2}' /etc/resolv.conf); do
  iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -p udp --dport 53 -d "$NS" -j ACCEPT
done
iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 169.254.169.254/32 -j DROP
iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 10.0.0.0/8 -j DROP
iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 172.16.0.0/12 -j DROP
iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -d 192.168.0.0/16 -j DROP
iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -p udp -j DROP
iptables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -p icmp -j DROP
ip6tables -A OUTPUT -m owner --uid-owner "$PROXIED_UID" -j DROP
