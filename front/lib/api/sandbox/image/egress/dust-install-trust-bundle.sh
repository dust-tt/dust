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

mkdir -p /etc/dust /usr/local/share/ca-certificates /etc/ssl/certs/java

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

# No JDK is installed in the base image today. When one is added later or
# installed at runtime, cover both JAVA_HOME and Debian's system Java keystore.
if command -v keytool >/dev/null 2>&1; then
  java_cacerts_candidates=()
  if [ -n "${JAVA_HOME:-}" ]; then
    java_cacerts_candidates+=("$JAVA_HOME/lib/security/cacerts")
  fi
  java_cacerts_candidates+=("/etc/ssl/certs/java/cacerts")
  if command -v java >/dev/null 2>&1; then
    java_bin="$(readlink -f "$(command -v java)")"
    java_home="$(dirname "$(dirname "$java_bin")")"
    java_cacerts_candidates+=("$java_home/lib/security/cacerts")
  fi

  java_cacerts_can_write() {
    local java_cacerts="$1"
    local java_cacerts_dir
    java_cacerts_dir="$(dirname "$java_cacerts")"

    [ -w "$java_cacerts" ] || {
      [ "$java_cacerts" = "/etc/ssl/certs/java/cacerts" ] &&
        [ ! -e "$java_cacerts" ] &&
        [ -w "$java_cacerts_dir" ]
    }
  }

  java_has_writable_cacerts=false
  for java_cacerts in "${java_cacerts_candidates[@]}"; do
    if java_cacerts_can_write "$java_cacerts"; then
      java_has_writable_cacerts=true
      break
    fi
  done

  if [ "$java_has_writable_cacerts" = true ]; then
    java_cacerts_seen=""
    for java_cacerts in "${java_cacerts_candidates[@]}"; do
      if ! java_cacerts_can_write "$java_cacerts"; then
        continue
      fi
      case ":$java_cacerts_seen:" in
        *":$java_cacerts:"*) continue ;;
      esac
      java_cacerts_seen="$java_cacerts_seen:$java_cacerts"
      if [ -e "$java_cacerts" ] && [ ! -s "$java_cacerts" ]; then
        rm -f "$java_cacerts"
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
      rm -f "$keytool_output"
      keytool_output=""
    done

    for java_cacerts in "${java_cacerts_candidates[@]}"; do
      if [ "$java_cacerts" = "/etc/ssl/certs/java/cacerts" ]; then
        continue
      fi
      if [ ! -e "$java_cacerts" ] &&
        [ -s "/etc/ssl/certs/java/cacerts" ] &&
        [ -w "$(dirname "$java_cacerts")" ]; then
        cp /etc/ssl/certs/java/cacerts "$java_cacerts"
        chmod 644 "$java_cacerts"
      fi
    done
  fi
fi
