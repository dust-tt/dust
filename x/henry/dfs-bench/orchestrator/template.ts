// Builds the `dfs-bench` E2B template, close to prod's `dust-base` where it matters for a filesystem
// benchmark: the same Ubuntu base, runtimes and search tools as dockerfiles/sandbox-bedrock.Dockerfile
// and front/lib/api/sandbox/image/registry.ts, the `agent` user and /files, and the same resources
// (2 vCPU, 2 GB). Built from public sources, not from prod's registry. Left out: fluent-bit, the
// egress proxy, sshd/hardening, LibreOffice, the Python data libraries and Dust's own tools.
// Invoked by bin/bootstrap.

import { Template, defaultBuildLogger } from "e2b";

const TEMPLATE = "dfs-bench";
// Versions pinned by prod's bedrock image.
const UBUNTU = "ubuntu:noble-20260210.1";
const NODE_VERSION = "24.16.0";
const PYTHON_VERSION = "3.14";

const template = Template()
  .fromImage(UBUNTU)
  .setUser("root")
  .aptInstall(
    [
      // bedrock
      "ca-certificates", "curl", "git", "unzip", "xz-utils", "gnupg", "lsb-release", "netcat-openbsd",
      "nftables", "acl",
      // dust-base search and file tools
      "ripgrep", "fd-find", "sd", "jq", "file", "sqlite3",
      // FUSE clients under test
      "fuse3",
    ],
    { noInstallRecommends: true }
  )
  // gcsfuse, prod's current /files mount: a reference point for the implementations under test.
  .runCmd(
    "curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg > /usr/share/keyrings/cloud.google.asc && " +
      'echo "deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt gcsfuse-$(lsb_release -c -s) main" ' +
      "> /etc/apt/sources.list.d/gcsfuse.list && " +
      "apt-get update && apt-get install -y --no-install-recommends gcsfuse && rm -rf /var/lib/apt/lists/*"
  )
  .runCmd(
    "curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh && " +
      `UV_PYTHON_INSTALL_DIR=/opt/python uv python install ${PYTHON_VERSION} && ` +
      `ln -sf "$(UV_PYTHON_INSTALL_DIR=/opt/python uv python find ${PYTHON_VERSION})" /usr/local/bin/python3 && ` +
      `ln -sf /usr/local/bin/python3 /usr/local/bin/python && ` +
      `uv venv /opt/venv --python /usr/local/bin/python3 && chmod -R 777 /opt/venv`
  )
  .runCmd(
    `curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o /tmp/node.tar.xz && ` +
      `curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt -o /tmp/SHASUMS256.txt && ` +
      `grep "node-v${NODE_VERSION}-linux-x64.tar.xz$" /tmp/SHASUMS256.txt | awk '{print $1 "  /tmp/node.tar.xz"}' | sha256sum -c - && ` +
      "tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz /tmp/SHASUMS256.txt"
  )
  .runCmd(
    "id agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent && " +
      "mkdir -p /files && chmod 777 /files && " +
      // Lets a root-run FUSE mount pass allow_other, so the agent user can use it as in prod.
      "echo user_allow_other >> /etc/fuse.conf && " +
      // E2B's own build steps install sudo; prod's bedrock image refuses it. The orchestrator runs
      // commands as root through envd, so nothing here needs it.
      "apt-get purge -y sudo && apt-get autoremove -y && ! command -v sudo"
  );

const info = await Template.build(template, {
  alias: TEMPLATE,
  cpuCount: 2,
  memoryMB: 2048,
  onBuildLogs: defaultBuildLogger({ minLevel: "warn" }),
});
process.stderr.write(`built template ${info.alias} (${info.templateId}, build ${info.buildId})\n`);
