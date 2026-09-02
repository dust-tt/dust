import {
  getLocalAccountPrivilegeHardeningCommand,
  getRootConsumedPathHardeningCommand,
  getSandboxServicePathHardeningCommand,
} from "@app/lib/api/sandbox/hardening";
import {
  buildPodPackage,
  POD_PACKAGE_IMAGE_DIR,
  POD_PACKAGE_NAME,
  POD_PACKAGE_VERSION,
} from "@app/lib/api/sandbox/image/pod_package";
import { PROFILE_DIR } from "@app/lib/api/sandbox/image/profile";
import { buildDustToolsBinary } from "@app/lib/api/sandbox/image/profile/build";
import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { ToolEntry } from "@app/lib/api/sandbox/image/types";
import {
  DSBX_TOOL_NAME,
  PROXY_ONLY_NETWORK_POLICY,
  SANDBOX_AGENT_PROXIED_UID,
} from "@app/lib/api/sandbox/image/types";
import { SANDBOX_TRUST_ENV_VARS } from "@app/lib/api/sandbox/trust_env";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import fs from "fs";
import path from "path";

const DUST_BEDROCK_IMAGE_VERSION = "1.11.0";
const DUST_BASE_IMAGE_VERSION = "0.8.106";
const DSBX_CLI_VERSION = "0.1.57";
// Identity, not coverage list: agent-proxied is a specific Linux user. The
// nftables ruleset covers SANDBOX_EGRESS_CONTROLLED_UIDS; this constant is
// the stable identity used when creating the workload account.
const AGENT_PROXIED_UID = SANDBOX_AGENT_PROXIED_UID;
// Built from https://github.com/openai/codex at tag rust-v0.115.0 (Apache-2.0).
// Released via the "Release sandbox tool" GitHub Actions workflow.
const APPLY_PATCH_VERSION = "0.1.0";
// Modern x86_64 build (requires AVX2). Switch to the baseline variant if a
// future sandbox CPU lacks it.
const BUN_VERSION = "1.3.14";
// dbt Cloud CLI (closed-source; github.com/dbt-labs/dbt-cli). Invoked as `dbt`.
const DBT_CLI_VERSION = "0.40.18";
// Snowflake CLI (github.com/snowflakedb/snowflake-cli). Invoked as `snow`.
// Linux x86_64 .deb from https://sfc-repo.snowflakecomputing.com/snowflake-cli/
const SNOWFLAKE_CLI_VERSION = "3.23.0";
const SNOWFLAKE_CLI_DEB_SHA256 =
  "bb1a3e645c171f43dac44965daa4047c256424bf47c954fef8b2a00d38e84775";
// LibreOffice "Fresh" PPA. The Ubuntu 24.04 base ships LibreOffice 24.2, whose
// PDF layout engine places text differently from a current desktop LibreOffice
// (26.x). Since the pptx QA reads word positions off the soffice-rendered PDF to
// confirm text collisions, the engine version has to be pinned and reproducible
// - and close to what authors run - or the same deck detects collisions on one
// machine and not another. This assumes an Ubuntu base and build-time egress to
// launchpad.net; if PPAs are blocked, install the TDF .deb bundle instead.
const LIBREOFFICE_PPA = "ppa:libreoffice/ppa";
// Litestream (Apache-2.0) replicates the sandbox-state SQLite databases to the
// GCS replica mount.
const LITESTREAM_VERSION = "0.5.13";
const EGRESS_LOCAL_DIR = path.resolve(__dirname, "egress");
const LITESTREAM_LOCAL_DIR = path.resolve(__dirname, "litestream");
const PROFILE_LOCAL_DIR = path.resolve(__dirname, "profile");
const TELEMETRY_LOCAL_DIR = path.resolve(__dirname, "telemetry");
const TOKEN_LOCAL_DIR = path.resolve(__dirname, "token");

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
  {
    name: "fonttools",
    version: "4.63.0",
    description: "Font file inspection and rewriting",
  },
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
        .readdirSync(full, { withFileTypes: true })
        // Only copy regular files. Running the Python tools locally drops a
        // __pycache__/ directory in here; without this filter the build tries
        // to readFileSync that directory and dies with EISDIR.
        .filter((entry) => entry.isFile())
        .map((entry) => [
          entry.name,
          fs.readFileSync(path.join(full, entry.name)),
        ])
    );
  };
}

function getAgentProxiedSetupCommand(): string {
  // agent-proxied has its own primary group. Supplementary membership in
  // agent is limited to explicit shared state such as /files and pod DBs.
  return [
    `groupadd --gid ${AGENT_PROXIED_UID} agent-proxied`,
    `useradd --create-home --uid ${AGENT_PROXIED_UID} --gid agent-proxied --groups agent --shell /bin/bash agent-proxied`,
    "chgrp agent /files",
    "chmod 2775 /files",
    "setfacl -R -d -m g::rwx /files",
    "setfacl -R -m g::rwx /files",
  ].join(" && ");
}

function getEgressResolverUserSetupCommand(): string {
  return [
    "groupadd --system dust-egress-resolver",
    "useradd --system --no-create-home --gid dust-egress-resolver --shell /usr/sbin/nologin dust-egress-resolver",
  ].join(" && ");
}

function getDustStateUserSetupCommand(): string {
  // dust-state runs the litestream replication daemon (pod state). Primary
  // group dust-state owns the replica mount point; supplementary membership
  // in `agent` grants rw on the live databases dir shared with agent-proxied
  // function code. Deliberately not egress-controlled: it never executes
  // workload code.
  return [
    "groupadd --system dust-state",
    "useradd --system --no-create-home --gid dust-state --groups agent --shell /usr/sbin/nologin dust-state",
  ].join(" && ");
}

function getPodStateSetupCommand(): string {
  // /pod-state/databases holds the live SQLite files: both agent-proxied
  // function code (group agent) and the litestream daemon (user dust-state)
  // need rw, so it gets the same setgid + default-ACL treatment as /files.
  // /sandbox-state/replica is the gcsfuse mount point for the litestream replica
  // — the durable copy of pod state. Untrusted workload code must never read
  // or tamper with it, so the directory is dust-state-only: 0700 here, no
  // allow_other on the runtime mount.
  return [
    "install -d -o root -g root -m 755 /pod-state",
    "install -d -o dust-state -g agent -m 2770 /pod-state/databases",
    "setfacl -R -d -m g::rwx /pod-state/databases",
    "setfacl -R -m g::rwx /pod-state/databases",
    "install -d -o root -g root -m 755 /sandbox-state",
    "install -d -o dust-state -g dust-state -m 700 /sandbox-state/replica",
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
  // Create the /files parent directory. Mount subdirectories (conversation-{sId}, pod-{sId}) are
  // created at runtime by the mount adapter and symlinked to legacy paths (/files/conversation,
  // /files/pod) for backward compatibility.
  .runCmd("mkdir -p /files && chmod 777 /files", {
    user: "root",
  })
  .runCmd(getLocalAccountPrivilegeHardeningCommand(), { user: "root" })
  .runCmd(getAgentProxiedSetupCommand(), { user: "root" })
  .runCmd(getSshHardeningCommand(), { user: "root" })
  // The root-owned token broker requires /usr/bin/python3.
  .runCmd("apt-get update && apt-get install -y python3", { user: "root" })
  // The per-mount broker helpers live outside the agent's group-writable home and serve
  // mode-0600 tokens from /run/dust-gcs.
  .runCmd("mkdir -p /usr/local/bin", { user: "root" })
  .copy(
    getLocalContent(TOKEN_LOCAL_DIR, "dust-gcs-token-server.py"),
    "/usr/local/bin/dust-gcs-token-server.py",
    { user: "root" }
  )
  .copy(
    getLocalContent(TOKEN_LOCAL_DIR, "dust-gcs-write-token.sh"),
    "/usr/local/bin/dust-gcs-write-token.sh",
    { user: "root" }
  )
  .copy(
    getLocalContent(TOKEN_LOCAL_DIR, "dust-gcs-token-firewall.sh"),
    "/usr/local/bin/dust-gcs-token-firewall.sh",
    { user: "root" }
  )
  .runCmd(
    "chown root:root /usr/local/bin/dust-gcs-token-server.py /usr/local/bin/dust-gcs-write-token.sh /usr/local/bin/dust-gcs-token-firewall.sh && " +
      "chmod 755 /usr/local/bin/dust-gcs-token-server.py /usr/local/bin/dust-gcs-write-token.sh /usr/local/bin/dust-gcs-token-firewall.sh",
    { user: "root" }
  )
  .runCmd(getEgressResolverUserSetupCommand(), { user: "root" })
  .runCmd(getDustStateUserSetupCommand(), { user: "root" })
  .runCmd(getPodStateSetupCommand(), { user: "root" })
  // Hidden tools: installed but not in manifest (back profile functions)
  .runCmd(
    "apt-get update && apt-get install -y ripgrep fd-find sd systemd-resolved",
    {
      user: "root",
    }
  )
  // Create profile directory and copy profile scripts
  // The other tools are installed in bedrock
  // Bump LibreOffice past the distro's 24.2 to a current release so the
  // soffice PDF render (which the pptx QA reads word positions from) matches a
  // modern desktop engine.
  .runCmd(
    "apt-get update && apt-get install -y software-properties-common && " +
      `add-apt-repository -y ${LIBREOFFICE_PPA} && apt-get update`,
    { user: "root" }
  )
  // Metric-compatible font substitutes so soffice lays text out at the same
  // positions as the MS fonts it stands in for - Carlito=Calibri,
  // Caladea=Cambria, Liberation=Arial/Times/Courier - plus Noto as a broad
  // fallback. Without these, a Calibri/Cambria deck (the PowerPoint defaults)
  // reflows under a non-metric fallback and the QA misses real text collisions.
  // fc-cache rebuilds the fontconfig cache so the new fonts resolve at runtime.
  // libeot decodes the EOT fonts PowerPoint embeds in a deck, which pptx_fonts
  // extracts; libreoffice-core already depends on it, this pins it as ours.
  .runCmd(
    "apt-get update && apt-get install -y jq pandoc imagemagick ffmpeg unzip file " +
      "sqlite3 libreoffice libeot0 poppler-utils qpdf " +
      "fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 " +
      "fonts-noto-core && fc-cache -f",
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
      {
        name: "zod",
        version: "4.4.3",
        description: "Schema validation (sandbox function contracts)",
        runtime: "node",
      },
      {
        name: "drizzle-orm",
        version: "0.45.2",
        description:
          "SQLite ORM (pod database schema files and function queries)",
        runtime: "node",
      },
      {
        name: "drizzle-kit",
        version: "0.31.10",
        description: "drizzle-kit",
        runtime: "node",
      },
      {
        name: "@libsql/client",
        version: "0.17.4",
        description: "SQLite driver for drizzle-kit",
        runtime: "node",
      },
    ],
    {
      installCmd:
        "npm install -g typescript tsx pptxgenjs@4.0.1 zod@4.4.3 drizzle-orm@0.45.2 drizzle-kit@0.31.10 @libsql/client@0.17.4",
    }
  )
  .runCmd(
    `curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v${DSBX_CLI_VERSION}/dsbx-linux-x86_64 -o /tmp/dsbx && ` +
      `curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v${DSBX_CLI_VERSION}/checksums-sha256.txt -o /tmp/checksums-sha256.txt && ` +
      "grep dsbx-linux-x86_64 /tmp/checksums-sha256.txt | awk '{print $1 \"  /tmp/dsbx\"}' | sha256sum -c - && " +
      "chmod +x /tmp/dsbx && " +
      "mv /tmp/dsbx /opt/bin/dsbx && " +
      "chown root:root /opt/bin/dsbx && chmod 755 /opt/bin/dsbx",
    { user: "root" }
  )
  .registerTool({
    name: DSBX_TOOL_NAME,
    description: "Dust CLI",
    runtime: "system",
    isDustTool: true,
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
    isDustTool: true,
    profile: "openai",
  })
  .runCmd(
    `curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip -o /tmp/bun.zip && ` +
      `curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/SHASUMS256.txt -o /tmp/bun-checksums.txt && ` +
      "grep 'bun-linux-x64.zip' /tmp/bun-checksums.txt | awk '{print $1 \"  /tmp/bun.zip\"}' | sha256sum -c - && " +
      "unzip -j /tmp/bun.zip bun-linux-x64/bun -d /tmp && " +
      "mv /tmp/bun /opt/bin/bun && " +
      "chown root:root /opt/bin/bun && chmod 755 /opt/bin/bun",
    { user: "root" }
  )
  .registerTool({
    name: "bun",
    description: "Fast JavaScript/TypeScript runtime and package manager",
    runtime: "node",
  })
  .runCmd(
    `curl -fsSL https://github.com/dbt-labs/dbt-cli/releases/download/v${DBT_CLI_VERSION}/dbt_${DBT_CLI_VERSION}_linux_amd64.tar.gz -o /tmp/dbt.tar.gz && ` +
      `curl -fsSL https://github.com/dbt-labs/dbt-cli/releases/download/v${DBT_CLI_VERSION}/dbt_checksums.txt -o /tmp/dbt-checksums.txt && ` +
      `grep "dbt_${DBT_CLI_VERSION}_linux_amd64.tar.gz" /tmp/dbt-checksums.txt | awk '{print $1 "  /tmp/dbt.tar.gz"}' | sha256sum -c - && ` +
      "tar -xzf /tmp/dbt.tar.gz -C /tmp dbt && " +
      "rm /tmp/dbt.tar.gz /tmp/dbt-checksums.txt && " +
      "mv /tmp/dbt /opt/bin/dbt && " +
      "chown root:root /opt/bin/dbt && chmod 755 /opt/bin/dbt",
    { user: "root" }
  )
  .registerTool({
    name: "dbt",
    version: DBT_CLI_VERSION,
    description:
      "dbt Cloud CLI for running dbt commands against a dbt platform project",
    runtime: "system",
  })
  .runCmd(
    `curl -fsSL https://sfc-repo.snowflakecomputing.com/snowflake-cli/linux_x86_64/${SNOWFLAKE_CLI_VERSION}/snowflake-cli-${SNOWFLAKE_CLI_VERSION}.x86_64.deb -o /tmp/snowflake-cli.deb && ` +
      `echo "${SNOWFLAKE_CLI_DEB_SHA256}  /tmp/snowflake-cli.deb" | sha256sum -c - && ` +
      "apt-get install -y /tmp/snowflake-cli.deb && " +
      "ln -sf /usr/lib/snowflake/snowflake-cli/snow /opt/bin/snow && " +
      "chown -h root:root /opt/bin/snow && " +
      "rm -f /tmp/snowflake-cli.deb",
    { user: "root" }
  )
  .registerTool({
    name: "snow",
    version: SNOWFLAKE_CLI_VERSION,
    description:
      "Snowflake CLI for managing Snowflake accounts, objects, and apps",
    runtime: "system",
  })
  .runCmd(
    `curl -fsSL https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz -o /tmp/litestream.tar.gz && ` +
      "tar -xzf /tmp/litestream.tar.gz -C /tmp litestream && " +
      "rm /tmp/litestream.tar.gz && " +
      "mv /tmp/litestream /opt/bin/litestream && " +
      "chown root:root /opt/bin/litestream && chmod 755 /opt/bin/litestream",
    { user: "root" }
  )
  // Litestream unit + STATIC config (all paths are sandbox-state contract
  // constants), both baked at build. The unit is deliberately NOT enabled:
  // front starts it at runtime AFTER the replica gcsfuse mount and the
  // cold-start restore — at boot the daemon would write to the unmounted
  // local directory (the silent-unmount failure mode) and manage files
  // mid-restore.
  .copy(
    getLocalContent(LITESTREAM_LOCAL_DIR, "litestream.service"),
    "/etc/systemd/system/litestream.service",
    { user: "root" }
  )
  .copy(
    getLocalContent(LITESTREAM_LOCAL_DIR, "litestream.yml"),
    "/etc/litestream.yml",
    { user: "root" }
  )
  // Vendor @dust/pod into the global node_modules (see pod_package.ts for why
  // this is a build-time copy rather than an npm install).
  .runCmd(`mkdir -p ${path.posix.dirname(POD_PACKAGE_IMAGE_DIR)}`, {
    user: "root",
  })
  .copy(buildPodPackage, POD_PACKAGE_IMAGE_DIR, { user: "root" })
  .registerTool({
    name: POD_PACKAGE_NAME,
    version: POD_PACKAGE_VERSION,
    description:
      "Frame and Pod database access: db(name) returns a Drizzle instance over the sandbox owner's SQLite database",
    runtime: "node",
  })
  .runCmd(`mkdir -p ${PROFILE_DIR}`, { user: "root" })
  // Core: compiled dust-tools binary + shared shell infra
  .copy(buildDustToolsBinary, `${PROFILE_DIR}/dust-tools`, { user: "root" })
  .runCmd(`chmod +x ${PROFILE_DIR}/dust-tools`, { user: "root" })
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "common.sh"),
    `${PROFILE_DIR}/common.sh`,
    { user: "root" }
  )
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "shell.sh"),
    `${PROFILE_DIR}/shell.sh`,
    { user: "root" }
  )
  // Provider-specific profiles (sourced by common.sh based on DUST_PROFILE)
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "anthropic.sh"),
    `${PROFILE_DIR}/anthropic.sh`,
    { user: "root" }
  )
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "openai.sh"),
    `${PROFILE_DIR}/openai.sh`,
    { user: "root" }
  )
  .copy(
    getLocalContent(PROFILE_LOCAL_DIR, "gemini.sh"),
    `${PROFILE_DIR}/gemini.sh`,
    { user: "root" }
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
  .runCmd(
    "chown root:root /usr/local/bin/dust-install-trust-bundle && chmod 755 /usr/local/bin/dust-install-trust-bundle",
    {
      user: "root",
    }
  )
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
  // The system resolver must remain available to root-owned services without
  // becoming a DNS escape hatch for the two egress-controlled accounts.
  .runCmd(
    "mkdir -p /etc/dbus-1/system.d /etc/systemd/system/systemd-resolved.service.d",
    { user: "root" }
  )
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "dust-resolve1.conf"),
    "/etc/dbus-1/system.d/dust-resolve1.conf",
    { user: "root" }
  )
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "dust-systemd1.conf"),
    "/etc/dbus-1/system.d/dust-systemd1.conf",
    { user: "root" }
  )
  .copy(
    getLocalContent(EGRESS_LOCAL_DIR, "systemd-resolved-ipc.conf"),
    "/etc/systemd/system/systemd-resolved.service.d/dust-ipc.conf",
    { user: "root" }
  )
  .runCmd(
    "mkdir -p /etc/systemd/resolved.conf.d && " +
      "printf '%s\\n' '[Resolve]' 'DNS=8.8.8.8' 'FallbackDNS=' 'DNSStubListener=yes' > /etc/systemd/resolved.conf.d/dust-sandbox.conf && " +
      "ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf",
    { user: "root" }
  )
  .runCmd(
    "systemctl daemon-reload && systemctl enable systemd-resolved.service dust-egress-resolver.service dust-egress-nftables.service",
    { user: "root" }
  )
  // Run after all apt/npm installs as a final guard against a dependency
  // reintroducing sudo or privileged account state.
  .runCmd(getSandboxServicePathHardeningCommand(), { user: "root" })
  .runCmd(getLocalAccountPrivilegeHardeningCommand(), { user: "root" })
  .runCmd(getRootConsumedPathHardeningCommand(), { user: "root" })
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
    isDustTool: true,
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
    isDustTool: true,
    profile: "gemini",
  })
  .registerTool({
    name: "write_file",
    description:
      "Write content to file (atomic write, creates parent directories)",
    usage: "write_file <path> <content>",
    returns: "'Wrote <path> (<bytes> bytes)' on success",
    runtime: "system",
    isDustTool: true,
    profile: ["anthropic", "gemini"],
  })
  .registerTool({
    name: "edit_file",
    description:
      "Replace exact text in a single file. Supports --replace-all and returns unified diff",
    usage: "edit_file [--replace-all] <old_text> <new_text> <path>",
    returns: "'Edited <path>' on success, unified diff on stderr",
    runtime: "system",
    isDustTool: true,
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
    isDustTool: true,
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
    isDustTool: true,
    profile: ["openai", "gemini"],
  })
  // --- glob: uniform with pagination ---
  .registerTool({
    name: "glob",
    description: "Find files by glob pattern. Sorted, paginated output",
    usage: "glob <pattern> [--path PATH] [--offset N] [--limit N]",
    returns: "Sorted file paths with pagination hint",
    runtime: "system",
    isDustTool: true,
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
    isDustTool: true,
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
    isDustTool: true,
  })
  // --- pptx_inspect: structural inspection of .pptx decks ---
  .registerTool({
    name: "pptx_inspect",
    description:
      "Inspect and QA .pptx decks: slides, layouts, shapes, text, media",
    usage: "pptx_inspect <file> [mode]; see --help",
    returns: "Text report; --qa/--render publish JPEGs and print paths",
    runtime: "system",
    isDustTool: true,
  })
  // --- pptx_slides: safe slide-level structural edits ---
  .registerTool({
    name: "pptx_slides",
    description:
      "Duplicate, move, or delete .pptx slides without corrupting the package - shares image parts, deep-clones charts, rewrites relationship ids. --duplicate and --delete take a slide pattern (a single slide, a comma list, or ranges, e.g. 2,5,7-9), so do every duplicate or delete in one call rather than one slide at a time. Edit copies afterward with python-pptx",
    usage:
      "pptx_slides <file> (--duplicate N[,N,...] [--count K] [--after M] | --move N --to M | --delete N[,N,...])",
    returns: "A one-line summary of the change and the deck's new slide count",
    runtime: "system",
    isDustTool: true,
  })
  // --- pptx_fonts: install the faces a deck actually asks for ---
  .registerTool({
    name: "pptx_fonts",
    description:
      "Report the fonts a .pptx needs and install them: the faces embedded in the deck first, Google Fonts for the rest. A substituted face is ~10% off, so the render and the fit warnings both mislead",
    usage: "pptx_fonts <file> [--install]",
    returns: "One line per family: extracted, fetched, or still substituted",
    runtime: "system",
    isDustTool: true,
  })
  // --- docx_inspect: structural inspection of .docx documents ---
  .registerTool({
    name: "docx_inspect",
    description:
      "Inspect .docx structure: sections, headings outline, paragraph and character styles with resolved typography, run formatting, tables, tracked changes, fields, embedded media. Use before editing a document to map style names so the model can apply Heading1 / Normal / Quote rather than restyling inline. --render rasterizes pages to JPEG, published into the conversation; the command prints each page's scoped path (a files__cat-readable image). --render-dir DIR is the base dir renders publish under, as DIR/.docx_render/<doc>/ (default /files/conversation)",
    usage:
      "docx_inspect <file> [--styles] [--paragraphs] [--text] [--tables] [--sections] [--changes] [--fields] [--media] [--render] [--render-dir DIR] [--offset N] [--max N] [--page N]",
    returns:
      "Document overview with theme + default typography and heading outline, or one paragraph/style/section/table/change/field per line. Render mode publishes each page and prints its scoped path (files__cat-readable)",
    runtime: "system",
    isDustTool: true,
  })
  .withCapability("gcsfuse")
  .withCapability("dust_filesystem")
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
