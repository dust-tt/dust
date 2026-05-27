import { PROFILE_DIR } from "@app/lib/api/sandbox/image/profile";
import { buildDustToolsBinary } from "@app/lib/api/sandbox/image/profile/build";
import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import {
  DSBX_TOOL_NAME,
  PROXY_ONLY_NETWORK_POLICY,
  SANDBOX_AGENT_PROXIED_UID,
  type ToolEntry,
} from "@app/lib/api/sandbox/image/types";
import { SANDBOX_TRUST_ENV_VARS } from "@app/lib/api/sandbox/trust_env";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import fs from "fs";
import path from "path";

const DUST_BEDROCK_IMAGE_VERSION = "1.10.0";
const DUST_BASE_IMAGE_VERSION = "0.8.27";
const DSBX_CLI_VERSION = "0.1.23";
// Identity, not coverage list: agent-proxied is a specific Linux user. The
// nftables ruleset covers SANDBOX_UNTRUSTED_UIDS as a set; reordering that
// list must not silently change this user's UID.
const AGENT_PROXIED_UID = SANDBOX_AGENT_PROXIED_UID;
// Built from https://github.com/openai/codex at tag rust-v0.115.0 (Apache-2.0).
// Released via the "Release sandbox tool" GitHub Actions workflow.
const APPLY_PATCH_VERSION = "0.1.0";
const EGRESS_LOCAL_DIR = path.resolve(__dirname, "egress");
const PROFILE_LOCAL_DIR = path.resolve(__dirname, "profile");
const TELEMETRY_LOCAL_DIR = path.resolve(__dirname, "telemetry");

interface PythonLibrary {
  name: string;
  version: string;
  description: string;
}

const PYTHON_LIBRARIES: PythonLibrary[] = [
  { name: "pandas", version: "3.0.1", description: "Data analysis library" },
  { name: "numpy", version: "2.4.3", description: "Numerical computing" },
  { name: "scipy", version: "1.17.1", description: "Scientific computing" },
  { name: "scikit-learn", version: "1.8.0", description: "Machine learning" },
  { name: "statsmodels", version: "0.14.6", description: "Statistical models" },
  { name: "pyarrow", version: "23.0.1", description: "Arrow data format" },
  { name: "matplotlib", version: "3.10.8", description: "Plotting library" },
  {
    name: "seaborn",
    version: "0.13.2",
    description: "Statistical visualization",
  },
  { name: "plotly", version: "6.6.0", description: "Interactive plots" },
  { name: "requests", version: "2.32.5", description: "HTTP library" },
  { name: "openpyxl", version: "3.1.5", description: "Excel file support" },
  { name: "pdfplumber", version: "0.11.9", description: "PDF extraction" },
  { name: "pypdf", version: "6.8.0", description: "PDF manipulation" },
  { name: "reportlab", version: "4.4.10", description: "PDF generation" },
  {
    name: "python-docx",
    version: "1.2.0",
    description: "Word document support",
  },
  { name: "python-pptx", version: "1.0.2", description: "PowerPoint support" },
  {
    name: "beautifulsoup4",
    version: "4.14.3",
    description: "HTML/XML parsing",
  },
  { name: "lxml", version: "6.0.2", description: "XML processing" },
  { name: "pillow", version: "12.1.1", description: "Image processing" },
  { name: "sympy", version: "1.14.0", description: "Symbolic mathematics" },
  {
    name: "opencv-python",
    version: "4.13.0.92",
    description: "OpenCV package for python",
  },
  {
    name: "duckdb",
    version: "1.4.4",
    description: "In-process OLAP / SQL on dataframes",
  },
  {
    name: "markitdown",
    version: "0.1.3",
    description: "Office file to Markdown conversion",
  },
  {
    name: "pdf2image",
    version: "1.17.0",
    description: "PDF to image conversion",
  },
];

function getPythonToolEntries(): ToolEntry[] {
  return PYTHON_LIBRARIES.map((lib) => ({
    name: lib.name,
    version: lib.version,
    description: lib.description,
    runtime: "python" as const,
  }));
}

function getPythonInstallCmd(): string {
  const packages = PYTHON_LIBRARIES.map(
    (lib) => `${lib.name}==${lib.version}`
  ).join(" ");
  return `uv pip install --python /opt/venv ${packages}`;
}

function getLocalContent(dir: string, filename: string): () => string {
  return () => fs.readFileSync(path.join(dir, filename), "utf-8");
}

function buildTrustEnvironmentFile(): string {
  return (
    Object.entries(SANDBOX_TRUST_ENV_VARS)
      .map(([k, v]) => `${k}=${formatEnvironmentValue(v)}`)
      .join("\n") + "\n"
  );
}

function buildTrustProfileScript(): string {
  return (
    Object.entries(SANDBOX_TRUST_ENV_VARS)
      .map(([k, v]) => `export ${k}=${formatShellValue(v)}`)
      .join("\n") + "\n"
  );
}

function formatEnvironmentValue(value: string): string {
  return isBareEnvironmentValue(value) ? value : JSON.stringify(value);
}

function formatShellValue(value: string): string {
  if (isBareEnvironmentValue(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isBareEnvironmentValue(value: string): boolean {
  return /^[A-Za-z0-9_./:,@%+=-]+$/.test(value);
}

function getLocalDirContent(
  dir: string,
  subdir: string
): () => Map<string, Buffer> {
  return () => {
    const full = path.join(dir, subdir);
    return new Map(
      fs
        .readdirSync(full)
        .map((filename) => [
          filename,
          fs.readFileSync(path.join(full, filename)),
        ])
    );
  };
}

function getAgentProxiedSetupCommand(): string {
  // setgid bit on shared dirs + default POSIX ACLs ensures files created
  // by either agent or agent-proxied are group-owned by `agent` and
  // group-writable, regardless of the creating process's umask — avoids
  // a perms handoff footgun during the PR1→PR2 rollout window.
  return [
    "install -d -o agent -g agent -m 2775 /home/agent/.local /home/agent/.local/bin",
    `useradd --create-home --uid ${AGENT_PROXIED_UID} --gid agent --shell /bin/bash agent-proxied`,
    "chgrp agent /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation /files/project",
    "chmod g+ws /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation /files/project",
    "setfacl -R -d -m g::rwx /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation /files/project",
    "setfacl -R -m g::rwx /home/agent /home/agent/.local /home/agent/.local/bin /files/conversation /files/project",
  ].join(" && ");
}

function getLocalAccountPrivilegeHardeningCommand(): string {
  const lockRootPassword = [
    "if getent passwd root >/dev/null 2>&1; then",
    "passwd -l root >/dev/null 2>&1 || usermod --lock root >/dev/null 2>&1 || true;",
    "fi",
  ].join(" ");
  const lockEmptyPasswordAccounts = [
    "if getent shadow >/dev/null 2>&1; then",
    `getent shadow | awk -F: '$2 == "" {print $1}' | while IFS= read -r account; do`,
    '[ -z "$account" ] && continue;',
    'passwd -l "$account" >/dev/null 2>&1 || usermod --lock "$account" >/dev/null 2>&1 || true;',
    "done;",
    "fi",
  ].join(" ");
  const lockProviderUser = [
    "if getent passwd user >/dev/null 2>&1; then",
    "usermod --lock --expiredate 1 --shell /usr/sbin/nologin user",
    "&& for group in sudo admin wheel; do",
    'if getent group "$group" >/dev/null 2>&1; then',
    'gpasswd -d user "$group" >/dev/null 2>&1 || true;',
    "fi;",
    "done;",
    "fi",
  ].join(" ");
  const removePrivilegedGroupMembers = [
    "for group in sudo admin wheel; do",
    "members=$(getent group \"$group\" | awk -F: '{print $4}') || continue;",
    'old_ifs="$IFS";',
    "IFS=,;",
    "for member in $members; do",
    '[ -z "$member" ] || [ "$member" = root ] || gpasswd -d "$member" "$group" >/dev/null 2>&1 || true;',
    "done;",
    'IFS="$old_ifs";',
    "done",
  ].join(" ");
  const removePasswordlessSudoersRules = [
    "if [ -f /etc/sudoers ]; then",
    "sed -i -E '/^[[:space:]]*#/!{/NOPASSWD[[:space:]]*:[[:space:]]*ALL/d;}' /etc/sudoers;",
    "fi",
    "&& if [ -d /etc/sudoers.d ]; then",
    "find /etc/sudoers.d -maxdepth 1 -type f",
    "-exec sed -i -E '/^[[:space:]]*#/!{/NOPASSWD[[:space:]]*:[[:space:]]*ALL/d;}' {} +;",
    "fi",
  ].join(" ");
  const removeSudoBinary = [
    "if command -v sudo >/dev/null 2>&1; then",
    "DEBIAN_FRONTEND=noninteractive apt-get purge -y sudo >/dev/null 2>&1",
    '|| { sudo_path=$(command -v sudo); chmod u-s "$sudo_path"; mv "$sudo_path" "$sudo_path.disabled-by-dust"; };',
    "hash -r 2>/dev/null || true;",
    "fi",
  ].join(" ");
  const hardenLocalAuthHelpers = [
    "for path in /bin/su /usr/bin/su /bin/sg /usr/bin/sg /usr/bin/newgrp /usr/bin/passwd /usr/bin/chsh /usr/bin/chfn /usr/bin/gpasswd; do",
    'if [ -e "$path" ]; then chmod u-s "$path"; fi;',
    "done",
  ].join(" ");

  return [
    lockRootPassword,
    lockEmptyPasswordAccounts,
    lockProviderUser,
    removePrivilegedGroupMembers,
    removePasswordlessSudoersRules,
    removeSudoBinary,
    hardenLocalAuthHelpers,
    "if command -v sudo >/dev/null 2>&1; then echo 'sudo must not be installed in sandbox images' >&2; exit 1; fi",
  ].join(" && ");
}

function getEgressResolverUserSetupCommand(): string {
  return [
    "groupadd --system dust-egress-resolver",
    "useradd --system --no-create-home --gid dust-egress-resolver --shell /usr/sbin/nologin dust-egress-resolver",
  ].join(" && ");
}

function getPrivilegedExecutablePathHardeningCommand(): string {
  return [
    "install -d -o root -g root -m 755 /opt/bin /usr/local/bin",
    "chown root:root /opt/bin /usr/local/bin",
    "chmod 755 /opt/bin /usr/local/bin",
  ].join(" && ");
}

function getSshHardeningCommand(): string {
  // Layered on purpose, not redundant. `AllowUsers agent` is the load-bearing
  // lock (whitelist). The other lines defend the case where a future bedrock
  // bump reorders the Include directive, re-enables PAM, or restores a
  // permissive AuthorizedKeysCommand from the base image. Don't "clean up"
  // any of these without checking what happens if exactly one of them flips.
  const sshdConfig = [
    "# Managed by Dust. Untrusted sandbox code must not reach root through sshd.",
    "PermitRootLogin no",
    "PasswordAuthentication no",
    "KbdInteractiveAuthentication no",
    "ChallengeResponseAuthentication no",
    "PermitEmptyPasswords no",
    "UsePAM no",
    "AuthorizedKeysCommand none",
    "AuthorizedKeysFile /etc/ssh/authorized_keys/%u",
    "AllowUsers agent",
    "DenyUsers root agent-proxied",
  ];

  const ensureSshdConfigInclude =
    "if ! grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config.d/\\*.conf([[:space:]]|$)' /etc/ssh/sshd_config; then " +
    "sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config; fi";
  const writeSshdConfig = [
    "printf '%s\\n'",
    ...sshdConfig.map(formatShellValue),
    "> /etc/ssh/sshd_config.d/00-dust-sandbox-hardening.conf",
  ].join(" ");
  // In the bedrock image `sshd.service` is a symlink alias to `ssh.service`
  // and `sshd.socket` does not exist. Masking only the canonical units covers
  // both and keeps the build log free of the spurious "already a symlink" /
  // "does not exist" warnings that would otherwise mask real failures.
  const disableSshdServices =
    "if command -v systemctl >/dev/null 2>&1; then " +
    "systemctl disable --now ssh.service ssh.socket >/dev/null 2>&1 || true; fi";
  const maskSshdServices =
    "if command -v systemctl >/dev/null 2>&1; then " +
    "systemctl mask ssh.service ssh.socket >/dev/null 2>&1 || true; fi";

  return [
    "mkdir -p /etc/ssh/sshd_config.d /etc/ssh/authorized_keys",
    "chmod 755 /etc/ssh /etc/ssh/sshd_config.d /etc/ssh/authorized_keys",
    "touch /etc/ssh/sshd_config",
    ensureSshdConfigInclude,
    writeSshdConfig,
    "chmod 644 /etc/ssh/sshd_config /etc/ssh/sshd_config.d/00-dust-sandbox-hardening.conf",
    "if [ -f /etc/pam.d/sshd ]; then sed -i -E '/^[[:space:]]*auth[[:space:]].*pam_permit\\.so/s/^/# Disabled by Dust sandbox SSH hardening: /' /etc/pam.d/sshd; fi",
    disableSshdServices,
    maskSshdServices,
  ].join(" && ");
}

const DUST_BASE_IMAGE = SandboxImage.fromDocker(
  `dust-sbx-bedrock:${DUST_BEDROCK_IMAGE_VERSION}`
)
  // Create agent user first so e2b creates /home/agent with correct ownership.
  .setUser("agent")
  // Conversation + project files bootstrap.
  // Pre-create mount directories for faster GCS mounts. `/files/project` is only mounted when the
  // conversation belongs to a project; the directory always exists in the image so the path is
  // predictable for the agent prompt.
  .runCmd(
    "mkdir -p /files/conversation /files/project && chmod 777 /files/conversation /files/project",
    {
      user: "root",
    }
  )
  .runCmd(getLocalAccountPrivilegeHardeningCommand(), { user: "root" })
  .runCmd(getAgentProxiedSetupCommand(), { user: "root" })
  .runCmd(getSshHardeningCommand(), { user: "root" })
  // Create simple netcat-based token server script.
  .runCmd("mkdir -p /home/agent/.bin", { user: "root" })
  // TODO(2026-03-06 SANDBOX): .copy is broken, use file once fixed.
  .runCmd(
    `tee /home/agent/.bin/token-server.sh > /dev/null << 'SHELLEOF'
#!/bin/bash
while true; do
  (echo -ne "HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nContent-Length: $(stat -c %s /tmp/token.json 2>/dev/null || echo 0)\\r\\n\\r\\n"; cat /tmp/token.json 2>/dev/null) | nc -l -p 9876 -q 1
done
SHELLEOF`,
    { user: "root" }
  )
  .runCmd("chmod 755 /home/agent/.bin/token-server.sh", { user: "root" })
  .runCmd(getEgressResolverUserSetupCommand(), { user: "root" })
  // Add sentinel file to indicate when the conversation mount is pending. We intentionally do
  // NOT add an equivalent marker under /files/project: the project mount is conditional (only
  // happens for project conversations), so a baked marker would be misleading in non-project
  // conversations where no mount ever lands.
  .runCmd("touch /files/conversation/.mount-pending", { user: "root" })
  // Hidden tools: installed but not in manifest (back profile functions)
  .runCmd("apt-get update && apt-get install -y ripgrep fd-find sd", {
    user: "root",
  })
  // Create profile directory and copy profile scripts
  // The other tools are installed in bedrock
  .runCmd(
    "apt-get update && apt-get install -y jq pandoc imagemagick ffmpeg unzip file " +
      "libreoffice poppler-utils qpdf",
    { user: "root" }
  )
  .registerTool([
    { name: "git", description: "Version control system", runtime: "system" },
    { name: "curl", description: "HTTP client", runtime: "system" },
    { name: "wget", description: "Network downloader", runtime: "system" },
    { name: "jq", description: "JSON processor", runtime: "system" },
    { name: "sqlite3", description: "SQLite database", runtime: "system" },
    { name: "pandoc", description: "Document converter", runtime: "system" },
    {
      name: "imagemagick",
      description: "Image manipulation",
      runtime: "system",
    },
    { name: "ffmpeg", description: "Media processing", runtime: "system" },
    { name: "unzip", description: "Archive extraction", runtime: "system" },
    {
      name: "lsb-release",
      description: "Linux distribution info",
      runtime: "system",
    },
    {
      name: "file",
      description: "Determine file type",
      runtime: "system",
    },
    {
      name: "libreoffice",
      description: "Office suite (soffice CLI for pptx/xlsx/docx conversion)",
      runtime: "system",
    },
    {
      name: "poppler-utils",
      description: "PDF utilities: pdftoppm, pdftotext, pdfimages",
      runtime: "system",
    },
    {
      name: "qpdf",
      description: "PDF transformation (merge, split, encrypt)",
      runtime: "system",
    },
  ])
  .registerTool({
    name: "python",
    description: "Python interpreter",
    runtime: "python",
  })
  .registerTool(getPythonToolEntries(), { installCmd: getPythonInstallCmd() })
  .registerTool(
    [
      {
        name: "typescript",
        description: "TypeScript compiler",
        runtime: "node",
      },
      { name: "tsx", description: "TypeScript executor", runtime: "node" },
      {
        name: "pptxgenjs",
        version: "4.0.1",
        description: "PowerPoint generation library",
        runtime: "node",
      },
    ],
    { installCmd: "npm install -g typescript tsx pptxgenjs@4.0.1" }
  )
  .runCmd(
    `curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v${DSBX_CLI_VERSION}/dsbx-linux-x86_64 -o /tmp/dsbx && ` +
      `curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v${DSBX_CLI_VERSION}/checksums-sha256.txt -o /tmp/checksums-sha256.txt && ` +
      "grep dsbx-linux-x86_64 /tmp/checksums-sha256.txt | awk '{print $1 \"  /tmp/dsbx\"}' | sha256sum -c - && " +
      "chmod +x /tmp/dsbx && " +
      "mv /tmp/dsbx /opt/bin/dsbx",
    { user: "root" }
  )
  .registerTool({
    name: DSBX_TOOL_NAME,
    description: "Dust CLI",
    runtime: "system",
  })
  .runCmd("mkdir -p /skills && chmod 755 /skills", { user: "root" })
  .runCmd(
    `curl -fsSL https://github.com/dust-tt/dust/releases/download/apply-patch-v${APPLY_PATCH_VERSION}/apply_patch-linux-x86_64 -o /tmp/apply_patch && ` +
      `curl -fsSL https://github.com/dust-tt/dust/releases/download/apply-patch-v${APPLY_PATCH_VERSION}/checksums-sha256.txt -o /tmp/checksums-sha256.txt && ` +
      "grep apply_patch-linux-x86_64 /tmp/checksums-sha256.txt | awk '{print $1 \"  /tmp/apply_patch\"}' | sha256sum -c - && " +
      "chmod +x /tmp/apply_patch && " +
      "mv /tmp/apply_patch /opt/bin/apply_patch",
    { user: "root" }
  )
  .registerTool({
    name: "apply_patch",
    description:
      "Apply V4A diffs to files. Supports add, update, and delete operations",
    usage:
      "apply_patch '*** Begin Patch\\n*** Update File: <path>\\n@@ [context]\\n-old\\n+new\\n*** End Patch'",
    returns: "Summary of applied changes (A/M/D per file)",
    runtime: "system",
    profile: "openai",
  })
  .runCmd(`mkdir -p ${PROFILE_DIR}`, { user: "root" })
  // Core: compiled dust-tools binary + shared shell infra
  .copy(buildDustToolsBinary, `${PROFILE_DIR}/dust-tools`, { user: "root" })
  .runCmd(`chmod +x ${PROFILE_DIR}/dust-tools`, { user: "root" })
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "common.sh"),
    `${PROFILE_DIR}/common.sh`
  )
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "shell.sh"),
    `${PROFILE_DIR}/shell.sh`
  )
  // Provider-specific profiles (sourced by common.sh based on DUST_PROFILE)
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "anthropic.sh"),
    `${PROFILE_DIR}/anthropic.sh`
  )
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "openai.sh"),
    `${PROFILE_DIR}/openai.sh`
  )
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "gemini.sh"),
    `${PROFILE_DIR}/gemini.sh`
  )
  .copy(
    getLocalDirContent(PROFILE_LOCAL_DIR, "soffice"),
    `${PROFILE_DIR}/soffice`,
    { user: "root" }
  )
  .runCmd(`chmod +x ${PROFILE_DIR}/soffice/*.py`, { user: "root" })
  // Telemetry configs for fluent-bit
  .copy(
    getLocalContent(TELEMETRY_LOCAL_DIR, "fluent-bit.conf"),
    "/etc/fluent-bit/fluent-bit.conf",
    { user: "root" }
  )
  .copy(
    getLocalContent(TELEMETRY_LOCAL_DIR, "parsers.conf"),
    "/etc/fluent-bit/parsers.conf",
    { user: "root" }
  )
  .copy(
    getLocalContent(TELEMETRY_LOCAL_DIR, "enrich.lua"),
    "/etc/fluent-bit/enrich.lua",
    { user: "root" }
  )
  // fluent-bit systemd service (started at runtime with env vars)
  .copy(
    getLocalContent(TELEMETRY_LOCAL_DIR, "fluent-bit.service"),
    "/etc/systemd/system/fluent-bit.service",
    { user: "root" }
  )
  // Seed /etc/dust/ca-bundle.pem with the system roots so replace-style trust
  // env vars (set unconditionally on the sandbox process) point at a valid
  // file from the moment the sandbox boots. installMitmTrustBundle overwrites
  // this atomically with (system roots + dsbx CA) once the egress forwarder is
  // up; in dev-unrestricted mode it stays the system-only copy.
  .runCmd(
    "mkdir -p /etc/dust && " +
      "install -m 644 /etc/ssl/certs/ca-certificates.crt /etc/dust/ca-bundle.pem",
    { user: "root" }
  )
  .copy(buildTrustEnvironmentFile, "/etc/dust/dust-trust.environment", {
    user: "root",
  })
  .runCmd(
    "printf '\\n' >> /etc/environment && " +
      "cat /etc/dust/dust-trust.environment >> /etc/environment",
    { user: "root" }
  )
  .copy(buildTrustProfileScript, "/etc/profile.d/dust-trust.sh", {
    user: "root",
  })
  .runCmd("chmod 644 /etc/profile.d/dust-trust.sh", { user: "root" })
  // tmpfiles.d entry; systemd-tmpfiles-setup.service recreates /run/dust on
  // every boot. No build-time --create: /run is tmpfs and any image-time
  // state under /run is discarded at boot anyway.
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "dust-run-dust.tmpfiles"),
    "/etc/tmpfiles.d/dust-run-dust.conf",
    { user: "root" }
  )
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "dust-install-trust-bundle.sh"),
    "/usr/local/bin/dust-install-trust-bundle",
    { user: "root" }
  )
  .runCmd("chmod 755 /usr/local/bin/dust-install-trust-bundle", {
    user: "root",
  })
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "egress-nftables.sh"),
    "/etc/dust/egress-nftables.sh",
    { user: "root" }
  )
  .runCmd("chmod 755 /etc/dust/egress-nftables.sh", { user: "root" })
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "dust-egress-nftables.service"),
    "/etc/systemd/system/dust-egress-nftables.service",
    { user: "root" }
  )
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "dust-egress-resolver.service"),
    "/etc/systemd/system/dust-egress-resolver.service",
    { user: "root" }
  )
  .runCmd(
    "systemctl daemon-reload && systemctl enable dust-egress-resolver.service dust-egress-nftables.service",
    { user: "root" }
  )
  // Run after all apt/npm installs as a final guard against a dependency
  // reintroducing sudo or privileged account state.
  .runCmd(getLocalAccountPrivilegeHardeningCommand(), { user: "root" })
  .runCmd(getPrivilegedExecutablePathHardeningCommand(), { user: "root" })
  // Profile functions (no install needed, provided by profile scripts)
  // --- read_file: anthropic/openai use offset/limit, gemini uses start/end ---
  .registerTool({
    name: "read_file",
    description:
      "Read file with line numbers, binary detection, and pagination. Reports totalLines",
    usage: "read_file <path> [offset] [limit]",
    returns:
      "Header with line range + numbered lines (format: '  N\\tcontent')",
    runtime: "system",
    profile: ["anthropic", "openai"],
  })
  .registerTool({
    name: "read_file",
    description:
      "Read file with line numbers, binary detection, and pagination. Reports totalLines",
    usage: "read_file <path> [start] [end]",
    returns:
      "Header with line range + numbered lines (format: '  N\\tcontent')",
    runtime: "system",
    profile: "gemini",
  })
  .registerTool({
    name: "write_file",
    description:
      "Write content to file (atomic write, creates parent directories)",
    usage: "write_file <path> <content>",
    returns: "'Wrote <path> (<bytes> bytes)' on success",
    runtime: "system",
    profile: ["anthropic", "gemini"],
  })
  .registerTool({
    name: "edit_file",
    description:
      "Replace exact text in a single file. Supports --replace-all and returns unified diff",
    usage: "edit_file [--replace-all] <old_text> <new_text> <path>",
    returns: "'Edited <path>' on success, unified diff on stderr",
    runtime: "system",
    profile: ["anthropic", "gemini"],
  })
  // --- grep_files: anthropic has extra flags ---
  .registerTool({
    name: "grep_files",
    description:
      "Recursively search files for regex pattern under --path (default: cwd). Sorted output. Supports output modes and case-insensitive search",
    usage:
      "grep_files <pattern> [--glob GLOB] [--path PATH] [--max-results N] [--max-per-file N] [--context N] [--offset N] [--output-mode content|files|count] [--case-insensitive] [--max-line-length N]",
    returns: "file:line:content format with match count footer",
    runtime: "system",
    profile: "anthropic",
  })
  .registerTool({
    name: "grep_files",
    description:
      "Recursively search files for regex pattern under --path (default: cwd). Sorted output",
    usage:
      "grep_files <pattern> [--glob GLOB] [--path PATH] [--max-results N] [--max-per-file N] [--context N] [--offset N]",
    returns: "file:line:content format with match count footer",
    runtime: "system",
    profile: ["openai", "gemini"],
  })
  // --- glob: uniform with pagination ---
  .registerTool({
    name: "glob",
    description: "Find files by glob pattern. Sorted, paginated output",
    usage: "glob <pattern> [--path PATH] [--offset N] [--limit N]",
    returns: "Sorted file paths with pagination hint",
    runtime: "system",
  })
  // --- list_dir: uniform with type suffixes and pagination ---
  .registerTool({
    name: "list_dir",
    description:
      "List directory contents with type indicators (/ for dirs, @ for symlinks). Sorted, paginated",
    usage: "list_dir [path] [--depth N] [--offset N] [--limit N]",
    returns: "Sorted paths with type suffixes and pagination hint",
    profile: ["openai", "gemini"],
    runtime: "system",
  })
  // --- xlsx_inspect: structural inspection of .xlsx workbooks ---
  .registerTool({
    name: "xlsx_inspect",
    description:
      "Inspect .xlsx structure: sheets, formulas, cached values, number formats, font and fill color (theme/indexed colors resolved to ARGB). --grep --meta searches by metadata tokens (e.g. 'fill: FFFF...' for yellow highlights, 'numFmt: 0%' for percent-formatted cells)",
    usage:
      "xlsx_inspect <file> [--sheet NAME] [--range A1:Z50] [--grep PATTERN [--regex] [--meta]] [--names] [--limit N] [--offset N]",
    returns:
      "Workbook overview, or one cell per line: '<address>  <formula or value>  [cached result]  numFmt: <fmt>  [font: <color>]  [fill: <color>]'. Empty cells skipped",
    runtime: "system",
  })
  // --- pptx_inspect: structural inspection of .pptx decks ---
  .registerTool({
    name: "pptx_inspect",
    description:
      "Inspect .pptx structure: slides, layouts, shapes, text, charts, tables, embedded media. Use before editing a deck to map layouts and shape positions. --render rasterizes slides to JPEG via soffice + pdftoppm for visual QA",
    usage:
      "pptx_inspect <file> [--slide N] [--layouts] [--text] [--media] [--render] [--max-shapes N] [--offset N]",
    returns:
      "Deck overview, or one shape per line in slide view: '<id>  <kind>  <left,top WxH>  [ph=<type>]  <summary>' with paragraphs indented. Layouts/text/media views emit format-specific listings. --render prints one absolute JPEG path per slide",
    runtime: "system",
  })
  // --- docx_inspect: structural inspection of .docx documents ---
  .registerTool({
    name: "docx_inspect",
    description:
      "Inspect .docx structure: sections, headings outline, paragraph and character styles with resolved typography, run formatting, tables, tracked changes, fields, embedded media. Use before editing a document to map style names so the model can apply Heading1 / Normal / Quote rather than restyling inline",
    usage:
      "docx_inspect <file> [--styles] [--paragraphs] [--text] [--tables] [--sections] [--changes] [--fields] [--media] [--render] [--offset N] [--max N] [--page N]",
    returns:
      "Document overview with theme + default typography and heading outline, or one paragraph/style/section/table/change/field per line. Render mode emits one absolute jpeg path per page",
    runtime: "system",
  })
  .withCapability("gcsfuse")
  .withResources({ vcpu: 2, memoryMb: 2048 })
  .withNetwork(PROXY_ONLY_NETWORK_POLICY)
  .setWorkdir("/home/agent")
  .withToolManifest()
  .register({
    imageName: "dust-base",
    tag: DUST_BASE_IMAGE_VERSION,
  });

const IMAGES: readonly SandboxImage[] = [DUST_BASE_IMAGE];

export function getRegisteredImages(): readonly SandboxImage[] {
  return IMAGES.filter((image) => {
    if (!image.imageId) {
      logger.warn("Skipping unregistered sandbox image (no imageId)");
      return false;
    }
    return true;
  });
}

export function getSandboxImageFromRegistry(opts: {
  name: string;
  tag?: string;
}): Result<SandboxImage, Error> {
  const { name, tag } = opts;
  const image = getRegisteredImages().find((img) => {
    if (img.imageId?.imageName !== name) {
      return false;
    }
    if (tag !== undefined && img.imageId?.tag !== tag) {
      return false;
    }
    return true;
  });
  if (!image) {
    const id = tag ? `${name}:${tag}` : name;
    return new Err(new Error(`No sandbox image found: ${id}`));
  }
  return new Ok(image);
}
