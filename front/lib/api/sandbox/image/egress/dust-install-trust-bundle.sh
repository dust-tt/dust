#!/bin/bash
set -euo pipefail

CA_PATH="/run/dust/egress-ca.pem"
SYSTEM_CA_DIR="/usr/local/share/ca-certificates"
SYSTEM_CA_DEST="${SYSTEM_CA_DIR}/dust-egress.crt"
SYSTEM_CA_CERTS_DIR="/etc/ssl/certs"
SYSTEM_CA_BUNDLE="${SYSTEM_CA_CERTS_DIR}/ca-certificates.crt"
MERGED_BUNDLE="/etc/dust/ca-bundle.pem"
PRISTINE_SYSTEM_BUNDLE="/etc/dust/system-ca-certificates.crt.orig"

if [ ! -s "$CA_PATH" ]; then
  /usr/bin/printf '%s\n' "dsbx CA file $CA_PATH missing or empty" >&2
  exit 1
fi

/usr/bin/mkdir -p /etc/dust "${SYSTEM_CA_CERTS_DIR}/java"

normalized_ca_tmp="$(/usr/bin/mktemp /etc/dust/.egress-ca.pem.XXXXXX)"
system_tmp=""
bundle_tmp=""
keytool_output=""
cleanup() {
  /bin/rm -f "$normalized_ca_tmp" "$system_tmp" "$bundle_tmp" "$keytool_output"
}
trap cleanup EXIT

if [ ! -x /usr/bin/openssl ]; then
  /usr/bin/printf '%s\n' "openssl is required to validate $CA_PATH" >&2
  exit 1
fi

if ! /usr/bin/openssl x509 -in "$CA_PATH" -out "$normalized_ca_tmp" -outform PEM >/dev/null 2>&1; then
  /usr/bin/printf '%s\n' "dsbx CA file $CA_PATH is not a valid X.509 PEM certificate" >&2
  exit 1
fi

if [ ! -s "$PRISTINE_SYSTEM_BUNDLE" ]; then
  /usr/bin/install -o root -g root -m 644 "$SYSTEM_CA_BUNDLE" "$PRISTINE_SYSTEM_BUNDLE"
fi

if [ -L "$SYSTEM_CA_DIR" ] || { [ -e "$SYSTEM_CA_DIR" ] && [ ! -d "$SYSTEM_CA_DIR" ]; }; then
  /bin/rm -f "$SYSTEM_CA_DIR"
fi

/usr/bin/install -d -o root -g root -m 755 "$SYSTEM_CA_DIR"
/usr/bin/chown root:root "$SYSTEM_CA_DIR"
/usr/bin/chmod 755 "$SYSTEM_CA_DIR"

# Treat this directory as Dust-owned staging and keep only the CA we install
# below, so the incremental system-store update cannot ingest workload-staged
# symlinks or garbage certs.
/usr/bin/find "$SYSTEM_CA_DIR" -mindepth 1 -maxdepth 1 -exec /bin/rm -rf -- {} +
/bin/rm -f "$SYSTEM_CA_DEST"

# update-ca-certificates forks openssl once per system root and spends most of
# cold-start on the constrained microVM. The image already has the public roots,
# so install only the runtime dsbx CA and reproduce the same bundle/hash-symlink
# outcome incrementally.
/usr/bin/install -o root -g root -m 644 "$normalized_ca_tmp" "$SYSTEM_CA_DEST"

system_tmp="$(/usr/bin/mktemp "${SYSTEM_CA_CERTS_DIR}/.ca-certificates.crt.XXXXXX")"
{ /bin/cat "$PRISTINE_SYSTEM_BUNDLE"; /usr/bin/printf '\n'; /bin/cat "$normalized_ca_tmp"; } > "$system_tmp"
/usr/bin/chmod 644 "$system_tmp"
/usr/bin/mv "$system_tmp" "$SYSTEM_CA_BUNDLE"

ca_hash="$(/usr/bin/openssl x509 -hash -noout -in "$normalized_ca_tmp")"
slot=0
while [ -e "${SYSTEM_CA_CERTS_DIR}/${ca_hash}.${slot}" ]; do
  if [ "$(/usr/bin/readlink -f "${SYSTEM_CA_CERTS_DIR}/${ca_hash}.${slot}")" = "$SYSTEM_CA_DEST" ]; then
    slot=""
    break
  fi
  slot=$((slot+1))
done
[ -n "$slot" ] && /bin/ln -sf "$SYSTEM_CA_DEST" "${SYSTEM_CA_CERTS_DIR}/${ca_hash}.${slot}"

bundle_tmp="$(/usr/bin/mktemp /etc/dust/.ca-bundle.pem.XXXXXX)"

# Concatenate with an explicit newline so the join point can never glue the
# last cert footer to the next BEGIN line if the pristine bundle drops its
# trailing newline.
{ /bin/cat "$PRISTINE_SYSTEM_BUNDLE"; /usr/bin/printf '\n'; /bin/cat "$normalized_ca_tmp"; } > "$bundle_tmp"
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
