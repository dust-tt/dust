#!/bin/bash
set -euo pipefail

CA_PATH="/run/dust/egress-ca.pem"
SYSTEM_CA_DEST="/usr/local/share/ca-certificates/dust-egress.crt"
SYSTEM_CA_BUNDLE="/etc/ssl/certs/ca-certificates.crt"
MERGED_BUNDLE="/etc/dust/ca-bundle.pem"

if [ ! -s "$CA_PATH" ]; then
  echo "dsbx CA file $CA_PATH missing or empty" >&2
  exit 1
fi

mkdir -p /etc/dust /usr/local/share/ca-certificates

if command -v update-ca-certificates >/dev/null 2>&1; then
  cp "$CA_PATH" "$SYSTEM_CA_DEST"
  if ! update-ca-certificates >/dev/null 2>&1; then
    echo "update-ca-certificates failed; continuing with explicit bundle" >&2
  fi
else
  echo "update-ca-certificates not found; continuing with explicit bundle" >&2
fi

bundle_tmp="$(mktemp /etc/dust/.ca-bundle.pem.XXXXXX)"
cleanup() {
  rm -f "$bundle_tmp" "${keytool_output:-}"
}
trap cleanup EXIT

# Concatenate with an explicit newline so the join point can never glue the
# last cert footer to the next BEGIN line if ca-certificates.crt drops its
# trailing newline. If update-ca-certificates ran successfully the dsbx CA is
# already in $SYSTEM_CA_BUNDLE; the explicit second copy is harmless (OpenSSL
# dedupes by subject) and keeps the merged bundle correct even when update-ca-
# certificates is missing or fails.
{ cat "$SYSTEM_CA_BUNDLE"; printf '\n'; cat "$CA_PATH"; } > "$bundle_tmp"
chmod 644 "$bundle_tmp"
mv "$bundle_tmp" "$MERGED_BUNDLE"

# Forward-compat: no JDK is installed in the base image today, so this branch
# never runs. Left in so the next image that adds Java gets the dsbx CA in
# $JAVA_HOME/lib/security/cacerts without a second slice.
if [ -n "${JAVA_HOME:-}" ]; then
  java_cacerts="$JAVA_HOME/lib/security/cacerts"
  if [ -w "$java_cacerts" ]; then
    if ! command -v keytool >/dev/null 2>&1; then
      echo "JAVA_HOME is set but keytool is not available" >&2
      exit 1
    fi

    keytool_output="$(mktemp)"
    if keytool -importcert -noprompt -trustcacerts \
      -alias dust-egress \
      -file "$CA_PATH" \
      -keystore "$java_cacerts" \
      -storepass changeit >"$keytool_output" 2>&1; then
      :
    elif grep -qi "already exists" "$keytool_output"; then
      :
    else
      cat "$keytool_output" >&2
      exit 1
    fi
  fi
fi
