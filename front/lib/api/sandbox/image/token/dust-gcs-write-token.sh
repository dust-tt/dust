#!/bin/bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: dust-gcs-write-token.sh PATH" >&2
  exit 2
fi

token_path="$1"
token_directory="$(/usr/bin/dirname -- "$token_path")"

if [[ ! "$token_path" =~ ^/run/dust-gcs/mount-[0-9]+\.json$ ]]; then
  echo "token path must be a mount token under /run/dust-gcs" >&2
  exit 2
fi

/usr/bin/install -d -o root -g root -m 700 "$token_directory"
umask 077
temporary_path="$(/usr/bin/mktemp "$token_directory/.token.XXXXXX")"
cleanup() {
  /usr/bin/rm -f -- "$temporary_path"
}
trap cleanup EXIT

/usr/bin/cat >"$temporary_path"
/usr/bin/chown root:root "$temporary_path"
/usr/bin/chmod 600 "$temporary_path"
/usr/bin/mv -f -- "$temporary_path" "$token_path"
trap - EXIT
