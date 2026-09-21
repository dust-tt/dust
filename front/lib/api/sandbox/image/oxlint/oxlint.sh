#!/bin/sh
set -eu

jemalloc=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
if [ ! -r "$jemalloc" ]; then
  echo "Oxlint requires libjemalloc2 in the sandbox image" >&2
  exit 1
fi

# Oxlint's JS plugins request a large allocation even for a tiny file.
# jemalloc leaves unused pages unbacked without changing vm.overcommit_memory.
# Scope the allocator to Oxlint and its children, including the type checker.
# https://github.com/oxc-project/oxc/issues/20331
LD_PRELOAD="$jemalloc${LD_PRELOAD:+:$LD_PRELOAD}" \
  exec /usr/local/bin/node /opt/npm-global/lib/node_modules/oxlint/bin/oxlint "$@"
