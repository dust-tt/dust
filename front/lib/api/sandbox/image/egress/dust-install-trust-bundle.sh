#!/bin/bash
set -euo pipefail

CA_PATH="/run/dust/egress-ca.pem"
SYSTEM_CA_DIR="/usr/local/share/ca-certificates"
SYSTEM_CA_DEST="${SYSTEM_CA_DIR}/dust-egress.crt"
SYSTEM_CA_BUNDLE="/etc/ssl/certs/ca-certificates.crt"
MERGED_BUNDLE="/etc/dust/ca-bundle.pem"

if [ ! -s "$CA_PATH" ]; then
  echo "dsbx CA file $CA_PATH missing or empty" >&2
  exit 1
fi

/usr/bin/mkdir -p /etc/dust /etc/ssl/certs/java

normalized_ca_tmp="$(/usr/bin/mktemp /etc/dust/.egress-ca.pem.XXXXXX)"
bundle_tmp=""
keytool_output=""
cleanup() {
  /bin/rm -f "$normalized_ca_tmp" "$bundle_tmp" "$keytool_output"
}
trap cleanup EXIT

if [ ! -x /usr/bin/openssl ]; then
  echo "openssl is required to validate $CA_PATH" >&2
  exit 1
fi

if ! /usr/bin/openssl x509 -in "$CA_PATH" -out "$normalized_ca_tmp" -outform PEM >/dev/null 2>&1; then
  echo "dsbx CA file $CA_PATH is not a valid X.509 PEM certificate" >&2
  exit 1
fi

if [ -L "$SYSTEM_CA_DIR" ] || { [ -e "$SYSTEM_CA_DIR" ] && [ ! -d "$SYSTEM_CA_DIR" ]; }; then
  /bin/rm -f "$SYSTEM_CA_DIR"
fi

/usr/bin/install -d -o root -g root -m 755 "$SYSTEM_CA_DIR"
/usr/bin/chown root:root "$SYSTEM_CA_DIR"
/usr/bin/chmod 755 "$SYSTEM_CA_DIR"

# update-ca-certificates follows symlinks under this directory. Treat it as
# Dust-owned staging and keep only the CA we install below before root asks it
# to rebuild the world-readable system bundle.
/usr/bin/find "$SYSTEM_CA_DIR" -mindepth 1 -maxdepth 1 -exec /bin/rm -rf -- {} +
/bin/rm -f "$SYSTEM_CA_DEST"

if [ -x /usr/sbin/update-ca-certificates ]; then
  /usr/bin/install -o root -g root -m 644 "$normalized_ca_tmp" "$SYSTEM_CA_DEST"
  if ! /usr/sbin/update-ca-certificates >/dev/null 2>&1; then
    echo "update-ca-certificates failed; continuing with explicit bundle" >&2
  fi
else
  echo "update-ca-certificates not found; continuing with explicit bundle" >&2
fi

bundle_tmp="$(/usr/bin/mktemp /etc/dust/.ca-bundle.pem.XXXXXX)"

# Concatenate with an explicit newline so the join point can never glue the
# last cert footer to the next BEGIN line if ca-certificates.crt drops its
# trailing newline. If update-ca-certificates ran successfully the dsbx CA is
# already in $SYSTEM_CA_BUNDLE; the explicit second copy is harmless (OpenSSL
# dedupes by subject) and keeps the merged bundle correct even when update-ca-
# certificates is missing or fails.
{ /bin/cat "$SYSTEM_CA_BUNDLE"; printf '\n'; /bin/cat "$normalized_ca_tmp"; } > "$bundle_tmp"
/usr/bin/chmod 644 "$bundle_tmp"
/usr/bin/mv "$bundle_tmp" "$MERGED_BUNDLE"

# No JDK is installed in the base image today. When one is added later or
# installed at runtime, cover both JAVA_HOME and Debian's system Java keystore.
if [ -x /usr/bin/keytool ]; then
  java_cacerts_candidates=()
  if [ -n "${JAVA_HOME:-}" ]; then
    java_cacerts_candidates+=("$JAVA_HOME/lib/security/cacerts")
  fi
  java_cacerts_candidates+=("/etc/ssl/certs/java/cacerts")
  if [ -x /usr/bin/java ]; then
    java_bin="$(/usr/bin/readlink -f /usr/bin/java)"
    java_home="$(/usr/bin/dirname "$(/usr/bin/dirname "$java_bin")")"
    java_cacerts_candidates+=("$java_home/lib/security/cacerts")
  fi

  java_cacerts_can_write() {
    local java_cacerts="$1"
    local java_cacerts_dir
    java_cacerts_dir="$(/usr/bin/dirname "$java_cacerts")"

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
        /bin/rm -f "$java_cacerts"
      fi

      keytool_output="$(/usr/bin/mktemp)"
      if /usr/bin/keytool -importcert -noprompt -trustcacerts \
        -alias dust-egress \
        -file "$normalized_ca_tmp" \
        -keystore "$java_cacerts" \
        -storepass changeit >"$keytool_output" 2>&1; then
        :
      elif /usr/bin/grep -qi "already exists" "$keytool_output"; then
        :
      else
        /bin/cat "$keytool_output" >&2
        exit 1
      fi
      /bin/rm -f "$keytool_output"
      keytool_output=""
    done

    for java_cacerts in "${java_cacerts_candidates[@]}"; do
      if [ "$java_cacerts" = "/etc/ssl/certs/java/cacerts" ]; then
        continue
      fi
      if [ ! -e "$java_cacerts" ] &&
        [ -s "/etc/ssl/certs/java/cacerts" ] &&
        [ -w "$(/usr/bin/dirname "$java_cacerts")" ]; then
        /usr/bin/cp /etc/ssl/certs/java/cacerts "$java_cacerts"
        /usr/bin/chmod 644 "$java_cacerts"
      fi
    done
  fi
fi
