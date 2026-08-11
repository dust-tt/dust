#!/bin/bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: dust-gcs-write-token.sh PATH" >&2
  exit 2
fi

token_path="$1"
token_directory="$(/usr/bin/dirname -- "$token_path")"

if [[ "$token_path" =~ ^/run/dust-gcs/mount-[0-9]+\.json$ ]]; then
  token_owner="root"
  token_group="root"
  /usr/bin/install -d -o root -g root -m 700 "$token_directory"
elif [ "$token_path" = "/run/dust-fs/token" ]; then
  token_owner="dust-fs"
  token_group="dust-fs"
  /usr/bin/install -d -o root -g dust-fs -m 750 "$token_directory"
else
  echo "token path must be a GCS mount token or /run/dust-fs/token" >&2
  exit 2
fi

umask 077
temporary_path="$(/usr/bin/mktemp "$token_directory/.token.XXXXXX")"
cleanup() {
  /usr/bin/rm -f -- "$temporary_path"
}
trap cleanup EXIT

/usr/bin/cat >"$temporary_path"
/usr/bin/chown "$token_owner:$token_group" "$temporary_path"
/usr/bin/chmod 600 "$temporary_path"
/usr/bin/mv -f -- "$temporary_path" "$token_path"
trap - EXIT
