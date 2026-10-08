#!/usr/bin/env bash
set -euo pipefail
ulimit -c 0
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p results/selective/cloud-build runtime/selective-bin
sudo cloud-init status --wait || test "$?" -eq 2
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential clang libclang-dev cmake pkg-config fuse3 libfuse3-dev python3 ripgrep util-linux curl sysstat openssl nfs-common acl
if ! rg -q '^user_allow_other$' /etc/fuse.conf; then
  printf 'user_allow_other\n' | sudo tee -a /etc/fuse.conf > /dev/null
fi
if ! test -x "$HOME/.cargo/bin/rustc"; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.96.0 --profile minimal
fi
rustup component add clippy rustfmt
python3 scripts/fingerprint.py > results/selective/cloud-build/source-before.json
cargo build --locked --release -j 4
cargo test --locked --release -j 4
cargo clippy --locked --release -j 4 --all-targets -- -D warnings
cargo fmt --check
bash scripts/smoke.sh
bash scripts/policy-mount.sh
python3 scripts/failure-scenarios.py --bin target/release --run runtime/selective-cloud-failures
cp "$(cat results/latest-smoke.txt)/unix.json" results/selective/cloud-build/unix.json
cp "$(cat results/latest-policy.txt)/policy.json" results/selective/cloud-build/policy.json
cp runtime/selective-cloud-failures/failure.json results/selective/cloud-build/failures.json
for name in dfsd dfsctl dfs-mount; do
  cp "target/release/$name" "runtime/selective-bin/$name"
  strip "runtime/selective-bin/$name"
done
sha256sum runtime/selective-bin/* > results/selective/cloud-build/binaries.sha256
python3 scripts/fingerprint.py > results/selective/cloud-build/source-after.json
cmp results/selective/cloud-build/source-before.json results/selective/cloud-build/source-after.json
rustc -Vv > results/selective/cloud-build/rustc.txt
uname -a > results/selective/cloud-build/kernel.txt
tar -czf runtime/selective-binaries.tar.gz -C runtime/selective-bin dfsd dfsctl dfs-mount
printf 'ready\n' > results/selective/cloud-build/ready.txt
