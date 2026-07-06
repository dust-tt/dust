#!/usr/bin/env bash
# Map, by pod ordinal, the shards (shard_id, shard_key, points_count) each peer holds.
#
# points_count is only present in a peer's own `local_shards`, and the API has no way to
# target a specific peer. So we poll the LB (which routes to a random peer) until every
# peer from /cluster has answered at least once (coupon collector), collecting its
# local_shards each time.
#
# Usage: QDRANT_CLUSTER_0_URL=... QDRANT_CLUSTER_0_API_KEY=... ./qdrant_shards_by_peer.sh [--verbose] <collection>
set -euo pipefail

VERBOSE=""
COLLECTION=""
for arg in "$@"; do
  case "$arg" in
    --verbose | -v) VERBOSE=1 ;;
    *) COLLECTION="$arg" ;;
  esac
done
: "${COLLECTION:?usage: $0 [--verbose] <collection>}"

BASE="$QDRANT_CLUSTER_0_URL"
AUTH=(-H "api-key: $QDRANT_CLUSTER_0_API_KEY")
MAX_ATTEMPTS="${MAX_ATTEMPTS:-100}"

# Progress goes to stderr, only when --verbose. stdout stays pure JSON for piping.
log() { [[ -n "$VERBOSE" ]] && echo "$@" >&2; return 0; }

# peer_id -> pod ordinal (ordinal = number before ".qdrant-headless" in the p2p uri).
ORDINALS="$(curl -s "${AUTH[@]}" "$BASE/cluster" \
  | jq -c '.result.peers | to_entries
      | map({key: .key, value: (.value.uri | capture("-(?<n>[0-9]+)\\.").n | tonumber)})
      | from_entries')"

want="$(jq -r 'keys[]' <<<"$ORDINALS" | sort -u)"
want_count="$(wc -l <<<"$want" | tr -d ' ')"

# Accumulate: peer_id -> local_shards array. Overwrites on repeat hits (idempotent).
collected='{}'
seen=0
for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
  resp="$(curl -s "${AUTH[@]}" "$BASE/collections/$COLLECTION/cluster")"
  pid="$(jq -r '.result.peer_id' <<<"$resp")"
  collected="$(jq -c --arg pid "$pid" --argjson r "$resp" \
    '.[$pid] = $r.result.local_shards' <<<"$collected")"
  seen="$(jq 'keys | length' <<<"$collected")"
  log "attempt $i: peer $pid answered — $seen/$want_count peers covered"
  [[ "$seen" -ge "$want_count" ]] && break
done

if [[ "$seen" -lt "$want_count" ]]; then
  echo "WARNING: only covered $seen/$want_count peers after $MAX_ATTEMPTS attempts" >&2
fi

# Join with ordinals, sort by ordinal, emit shards per peer.
jq -n --argjson collected "$collected" --argjson ordinals "$ORDINALS" '
  $collected | to_entries
  | map({
      ordinal: ($ordinals[.key]),
      peer_id: (.key | tonumber),
      shards: (.value | map({shard_id, shard_key, points_count}) | sort_by(.shard_id))
    })
  | sort_by(.ordinal)
'
