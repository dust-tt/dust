// Remote environment management - single command with subcommands
//
// Usage:
//   dust-hive remote                        # Show help
//   dust-hive remote add [name]             # Register a remote host
//   dust-hive remote list                   # List registered hosts
//   dust-hive remote remove <name>          # Remove a host
//   dust-hive remote envs <remote>          # List environments on remote
//   dust-hive remote spawn <remote>         # Create environment on remote
//   dust-hive remote open <remote/env>      # Mount + tunnels + zellij
//   dust-hive remote close <remote/env>     # Unmount + stop tunnels
//   dust-hive remote status <remote/env>    # Show status
//   dust-hive remote ssh <remote/env>       # SSH into environment
//   dust-hive remote exec <remote/env> <cmd> # Execute command
//   dust-hive remote git <remote/env> <args> # Git proxy
//   dust-hive remote warm <remote/env>      # Warm environment
//   dust-hive remote cool <remote/env>      # Cool environment
//   dust-hive remote stop <remote/env>      # Stop environment

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import * as p from "@clack/prompts";
import { logger } from "../lib/logger";
import { CONFIG_ENV_PATH, DUST_HIVE_HOME } from "../lib/paths";
import { restoreTerminal } from "../lib/prompt";
import {
  type RemoteHost,
  addRemoteHost,
  getRemoteHost,
  loadRemotes,
  removeRemoteHost,
  validateRemoteName,
} from "../lib/remote-host";
import {
  getRemoteEnvBasePort,
  getTunnelsStatus,
  startIapTunnels,
  stopIapTunnels,
} from "../lib/remote-iap";
import { translateArgsToRemote } from "../lib/remote-paths";
import { generateRemoteSkillContent, getRemoteSkillDir } from "../lib/remote-skill";
import {
  checkSshConnection,
  getRemoteHomeDir,
  scpToRemote,
  sshExec,
  sshExecStreaming,
  sshInteractive,
} from "../lib/remote-ssh";
import {
  getRemoteMountPoint,
  getRemoteWorktreePath,
  isMounted,
  isSshfsInstalled,
  mountRemoteEnv,
  unmountRemoteEnv,
} from "../lib/remote-sshfs";
import { getRemoteZellijSessionName, writeRemoteZellijLayout } from "../lib/remote-zellij";
import type { Result } from "../lib/result";
import { CommandError, Err, Ok } from "../lib/result";

// ============ Helpers ============

function parseRemoteEnvArg(arg: string): { remoteName: string; envName: string } | null {
  const parts = arg.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { remoteName: parts[0], envName: parts[1] };
}

function showHelp(): void {
  console.log(`
Remote environment management

Usage: dust-hive remote <subcommand> [options]

Host Management:
  add [name]              Register a new remote host (interactive)
  list                    List registered remote hosts
  remove <name>           Remove a registered remote host
  setup <remote>          Bootstrap dust-hive on a remote (idempotent)

Environment Management:
  envs <remote>           List environments on a remote host
  spawn <remote>          Create a new environment on remote
  start <remote/env>      Start an environment (SDK watch)
  warm <remote/env>       Warm an environment on remote
  cool <remote/env>       Cool an environment on remote
  stop <remote/env>       Stop an environment on remote

Local Access:
  open <remote/env>       Mount SSHFS + start IAP tunnels + open zellij
  close <remote/env>      Unmount SSHFS + stop IAP tunnels
  status <remote/env>     Show status (mount, tunnels, remote state)
  ssh <remote/env>        SSH directly into remote environment

Commands:
  exec <remote/env> <cmd> Execute a command on the remote environment
  git <remote/env> <args> Run git on the remote (for proxying)

Examples:
  dust-hive remote add linux
  dust-hive remote open linux/my-feature
  dust-hive remote exec linux/my-feature "npm test"
  dust-hive remote git linux/my-feature status
`);
}

// ============ Subcommand Implementations ============

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return undefined;
}

async function handleSetup(args: string[]): Promise<Result<void>> {
  const remoteName = args.find((a) => !a.startsWith("--"));
  if (!remoteName) {
    return Err(new CommandError("Usage: dust-hive remote setup <remote>"));
  }

  const host = await getRemoteHost(remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${remoteName}' not found`));
  }

  logger.step(`Setting up dust-hive on ${remoteName}...`);

  // Comprehensive bootstrap script that's idempotent
  // This can take a fresh Ubuntu VM to a fully functional dust-hive remote
  const bootstrapScript = `
set -e

echo "=============================================="
echo "  dust-hive Remote Bootstrap"
echo "=============================================="
echo ""

# ============================================
# 1. System packages
# ============================================
echo "==> [1/10] Installing system packages..."
if command -v apt-get &> /dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq \\
    build-essential \\
    cmake \\
    protobuf-compiler \\
    postgresql-client \\
    lsof \\
    curl \\
    git \\
    direnv \\
    2>/dev/null || true
  echo "  System packages installed"
else
  echo "  Warning: apt-get not found, skipping system packages"
fi

# ============================================
# 2. Bun
# ============================================
echo "==> [2/10] Checking bun..."
if ! command -v bun &> /dev/null; then
  echo "  Installing bun..."
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="\$HOME/.bun"
export PATH="\$BUN_INSTALL/bin:\$PATH"
echo "  bun: \$(bun --version)"

# ============================================
# 3. nvm and Node.js
# ============================================
echo "==> [3/10] Checking nvm..."
export NVM_DIR="\$HOME/.nvm"
if [ ! -d "\$NVM_DIR" ]; then
  echo "  Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
[ -s "\$NVM_DIR/nvm.sh" ] && source "\$NVM_DIR/nvm.sh"
echo "  nvm: installed"

# Install node version needed by dust
echo "  Installing Node.js..."
nvm install 20 2>/dev/null || true
nvm use 20 2>/dev/null || true
echo "  node: \$(node --version 2>/dev/null || echo 'checking...')"

# ============================================
# 4. Rust/Cargo
# ============================================
echo "==> [4/10] Checking cargo..."
if ! command -v cargo &> /dev/null; then
  echo "  Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
source "\$HOME/.cargo/env" 2>/dev/null || true
export PATH="\$HOME/.cargo/bin:\$PATH"
echo "  cargo: \$(cargo --version 2>/dev/null | head -1 || echo 'installed')"

# ============================================
# 5. Zellij
# ============================================
echo "==> [5/10] Checking zellij..."
if ! command -v zellij &> /dev/null; then
  echo "  Installing zellij..."
  cargo install --locked zellij 2>/dev/null || {
    # Fallback: download pre-built binary
    echo "  Cargo install failed, downloading pre-built binary..."
    ZELLIJ_VERSION="v0.43.1"
    curl -fsSL "https://github.com/zellij-org/zellij/releases/download/\${ZELLIJ_VERSION}/zellij-x86_64-unknown-linux-musl.tar.gz" | tar xz -C /tmp
    sudo mv /tmp/zellij /usr/local/bin/
  }
fi
echo "  zellij: \$(zellij --version 2>/dev/null || echo 'installed')"

# ============================================
# 6. Temporal CLI
# ============================================
echo "==> [6/10] Checking temporal CLI..."
export PATH="\$HOME/.temporalio/bin:\$PATH"
if ! command -v temporal &> /dev/null; then
  echo "  Installing temporal CLI..."
  curl -sSf https://temporal.download/cli.sh | sh
fi
echo "  temporal: \$(temporal --version 2>/dev/null | head -1 || echo 'installed')"

# ============================================
# 7. Dust repo
# ============================================
echo "==> [7/10] Checking dust repo..."
if [ ! -d ~/dust ]; then
  echo "  Cloning dust repo (linux branch)..."
  git clone -b linux https://github.com/dust-tt/dust.git ~/dust
else
  echo "  Dust repo exists, pulling latest from linux branch..."
  cd ~/dust && git fetch origin linux && git checkout linux && git pull origin linux 2>/dev/null || true
fi
echo "  Dust repo: ~/dust (branch: linux)"

# ============================================
# 8. dust-hive setup + node dependencies
# ============================================
echo "==> [8/10] Setting up dust-hive..."
cd ~/dust/x/henry/dust-hive
bun install

# Install node dependencies for the main repo (needed for spawn)
echo "  Installing node dependencies (this may take a few minutes)..."
cd ~/dust/sdks/js && npm install --silent
cd ~/dust/front && npm install --silent
cd ~/dust/connectors && npm install --silent
echo "  Node dependencies installed"

# Build Rust binaries (needed for warm) - all binaries are in core workspace
echo "  Building Rust binaries (this may take several minutes)..."
cd ~/dust/core
cargo build --release \
  --bin qdrant_create_collection \
  --bin elasticsearch_create_index \
  --bin init_db \
  --bin core-api \
  --bin oauth \
  --bin sqlite-worker \
  2>&1 | tail -10
echo "  Rust binaries built"

# Create global symlink with all necessary PATH entries
mkdir -p ~/.local/bin
cat > ~/.local/bin/dust-hive << 'WRAPPER'
#!/bin/bash
# Source nvm for node access
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
# Ensure all tool paths are available
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.temporalio/bin:$HOME/.cargo/bin:$PATH"
exec bun run ~/dust/x/henry/dust-hive/src/index.ts "$@"
WRAPPER
chmod +x ~/.local/bin/dust-hive
echo "  dust-hive symlink created"

# ============================================
# 9. Shell configuration
# ============================================
echo "==> [9/10] Configuring shell..."
for rc in ~/.bashrc ~/.zshrc; do
  if [ -f "\$rc" ] || [ "\$rc" = ~/.bashrc ]; then
    # PATH entries
    grep -q '.local/bin' "\$rc" 2>/dev/null || echo 'export PATH="\$HOME/.local/bin:\$PATH"' >> "\$rc"
    grep -q '.bun/bin' "\$rc" 2>/dev/null || echo 'export PATH="\$HOME/.bun/bin:\$PATH"' >> "\$rc"
    grep -q '.temporalio/bin' "\$rc" 2>/dev/null || echo 'export PATH="\$HOME/.temporalio/bin:\$PATH"' >> "\$rc"
    grep -q '.cargo/bin' "\$rc" 2>/dev/null || echo 'export PATH="\$HOME/.cargo/bin:\$PATH"' >> "\$rc"
    # direnv hook
    grep -q 'direnv hook' "\$rc" 2>/dev/null || echo 'eval "\$(direnv hook bash)"' >> "\$rc"
  fi
done 2>/dev/null || true
echo "  Shell configs updated"

# Create config.env template if it doesn't exist
mkdir -p ~/.dust-hive
if [ ! -f ~/.dust-hive/config.env ]; then
  cat > ~/.dust-hive/config.env << 'CONFIG_TEMPLATE'
# dust-hive configuration
# This file is sourced by env.sh - use 'export VAR=value' syntax
# Copy your environment variables from your existing .env file here
#
# Required variables - copy from local ~/.dust-hive/config.env or .env:
# export OPENAI_API_KEY=sk-...
# export DUST_API_KEY=...
# export GITHUB_APP_ID=...
# etc.
CONFIG_TEMPLATE
  echo "  Created ~/.dust-hive/config.env (add your secrets)"
fi

# ============================================
# 10. Verification
# ============================================
echo "==> [10/10] Verifying installation..."
export PATH="\$HOME/.local/bin:\$HOME/.bun/bin:\$HOME/.temporalio/bin:\$HOME/.cargo/bin:\$PATH"

echo ""
echo "Running dust-hive doctor..."
echo ""
dust-hive doctor || true

echo ""
echo "=============================================="
echo "  Bootstrap Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Edit config.env:     nano ~/.dust-hive/config.env"
echo "                          (add your secrets from local ~/.dust-hive/config.env)"
echo "  2. Start services:      cd ~/dust && dust-hive up --skip-sync"
echo "  3. Create environment:  dust-hive spawn <name>"
echo ""
`;

  const exitCode = await sshExecStreaming(host, bootstrapScript, { tty: true });

  if (exitCode !== 0) {
    return Err(new CommandError("Setup failed"));
  }

  // Copy local config.env to remote if it exists
  const localConfigExists = await Bun.file(CONFIG_ENV_PATH).exists();
  if (localConfigExists) {
    logger.step("Copying config.env to remote...");
    const scpResult = await scpToRemote(host, CONFIG_ENV_PATH, "~/.dust-hive/config.env");
    if (scpResult.success) {
      logger.success("config.env copied to remote");
    } else {
      logger.warn(`Failed to copy config.env: ${scpResult.error}`);
      logger.info("You'll need to manually copy your secrets to the remote");
    }
  } else {
    logger.warn("No local config.env found - you'll need to create one on the remote");
  }

  logger.success(`dust-hive installed on ${remoteName}`);
  console.log("\nNext steps:");
  console.log(
    `  1. Run: dust-hive remote exec ${remoteName} "cd ~/dust && dust-hive up --skip-sync"`
  );
  console.log(`  2. Run: dust-hive remote spawn ${remoteName} --name <env-name>`);

  return Ok(undefined);
}

// Helper to prompt for a text value or use a flag
async function promptOrUseFlag(
  flagValue: string | undefined,
  message: string,
  options: { placeholder?: string | undefined; validate?: (v: string) => string | undefined } = {}
): Promise<Result<string>> {
  if (flagValue) return Ok(flagValue);

  const textOptions: Parameters<typeof p.text>[0] = {
    message,
    validate: options.validate ?? ((v) => (v.trim() ? undefined : "Required")),
  };
  if (options.placeholder) {
    textOptions.placeholder = options.placeholder;
  }

  const result = await p.text(textOptions);
  if (p.isCancel(result)) return Err(new CommandError("Cancelled"));
  return Ok(result);
}

async function handleAdd(args: string[]): Promise<Result<void>> {
  // Parse flags from args
  const name = args.find((a) => !a.startsWith("--"));
  const projectFlag = parseFlag(args, "--project");
  const zoneFlag = parseFlag(args, "--zone");
  const instanceFlag = parseFlag(args, "--instance");
  const skipVerify = args.includes("--skip-verify");

  logger.step("Registering new remote host");

  // Get name interactively if not provided
  const hostNameResult = await promptOrUseFlag(name, "Remote host name (e.g., 'linux')", {
    placeholder: "linux",
    validate: (value) => {
      const validation = validateRemoteName(value);
      return validation.valid ? undefined : validation.error;
    },
  });
  if (!hostNameResult.ok) return hostNameResult;
  const hostName = hostNameResult.value;

  // Check if already exists
  if (await getRemoteHost(hostName)) {
    return Err(new CommandError(`Remote host '${hostName}' already exists`));
  }

  // Get GCP details (use flags if provided, otherwise prompt)
  const projectResult = await promptOrUseFlag(projectFlag, "GCP project ID");
  if (!projectResult.ok) return projectResult;

  const zoneResult = await promptOrUseFlag(zoneFlag, "GCP zone", { placeholder: "us-central1-a" });
  if (!zoneResult.ok) return zoneResult;

  const instanceResult = await promptOrUseFlag(instanceFlag, "GCP Compute Engine instance name");
  if (!instanceResult.ok) return instanceResult;

  const localUser = basename(homedir());

  // Test connection
  const prelimHost: RemoteHost = {
    name: hostName,
    type: "gcp-iap",
    project: projectResult.value,
    zone: zoneResult.value,
    instance: instanceResult.value,
    remoteUser: localUser,
    localUser,
  };

  let remoteUser = localUser;
  if (!skipVerify) {
    logger.step("Verifying SSH connection via IAP...");
    const connected = await checkSshConnection(prelimHost);
    if (!connected) {
      return Err(
        new CommandError(
          `Could not connect to ${instanceResult.value}. Ensure:\n  1. Instance exists and is running\n  2. You have IAP-secured Tunnel User role\n  3. gcloud is authenticated`
        )
      );
    }
    logger.success("Connected");

    // Get remote username
    const remoteHome = await getRemoteHomeDir(prelimHost);
    remoteUser = remoteHome ? basename(remoteHome) : localUser;
  }

  const host: RemoteHost = { ...prelimHost, remoteUser };
  await addRemoteHost(host);

  logger.success(`Remote host '${hostName}' registered`);
  console.log(`\nNext: dust-hive remote envs ${hostName}`);

  return Ok(undefined);
}

async function handleList(): Promise<Result<void>> {
  const remotes = await loadRemotes();

  if (remotes.length === 0) {
    console.log("No remote hosts registered.");
    console.log("\nRegister one with: dust-hive remote add");
    return Ok(undefined);
  }

  console.log("Remote hosts:\n");
  for (const r of remotes) {
    console.log(`  ${r.name}`);
    console.log(`    ${r.instance} (${r.project} / ${r.zone})`);
  }

  return Ok(undefined);
}

async function handleRemove(args: string[]): Promise<Result<void>> {
  const name = args[0];
  if (!name) {
    return Err(new CommandError("Usage: dust-hive remote remove <name>"));
  }

  if (!(await getRemoteHost(name))) {
    return Err(new CommandError(`Remote host '${name}' not found`));
  }

  await removeRemoteHost(name);
  logger.success(`Remote host '${name}' removed`);

  return Ok(undefined);
}

async function handleEnvs(args: string[]): Promise<Result<void>> {
  const remoteName = args[0];
  if (!remoteName) {
    return Err(new CommandError("Usage: dust-hive remote envs <remote>"));
  }

  const host = await getRemoteHost(remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${remoteName}' not found`));
  }

  logger.step(`Listing environments on ${remoteName}...`);
  const result = await sshExec(host, "dust-hive list", { timeout: 30000 });

  if (result.exitCode !== 0) {
    if (result.stderr.includes("not found")) {
      return Err(new CommandError(`dust-hive not installed on '${remoteName}'`));
    }
    return Err(new CommandError(`Failed: ${result.stderr}`));
  }

  console.log(result.stdout);
  return Ok(undefined);
}

async function handleSpawn(args: string[]): Promise<Result<void>> {
  const remoteName = args[0];
  if (!remoteName) {
    return Err(new CommandError("Usage: dust-hive remote spawn <remote> [--name <name>]"));
  }

  const host = await getRemoteHost(remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${remoteName}' not found`));
  }

  // Check for --name flag
  const nameIdx = args.indexOf("--name");
  const envName = nameIdx !== -1 ? args[nameIdx + 1] : undefined;

  logger.step(`Creating environment on ${remoteName}...`);
  let cmd = "dust-hive spawn --no-open";
  if (envName) cmd += ` --name ${envName}`;

  const exitCode = await sshExecStreaming(host, cmd);
  if (exitCode !== 0) {
    return Err(new CommandError("Failed to create environment"));
  }

  logger.success("Environment created");
  console.log(`\nNext: dust-hive remote open ${remoteName}/<env-name>`);

  return Ok(undefined);
}

async function handleRemoteCommand(
  args: string[],
  action: "warm" | "cool" | "stop" | "start"
): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  if (!remoteEnvArg) {
    return Err(new CommandError(`Usage: dust-hive remote ${action} <remote/env>`));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env> (e.g., linux/my-feature)"));
  }

  const host = await getRemoteHost(parsed.remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${parsed.remoteName}' not found`));
  }

  // Pass through any additional flags (e.g., --force-ports)
  const additionalArgs = args.slice(1).filter((a) => a.startsWith("--"));
  const flagsStr = additionalArgs.length > 0 ? ` ${additionalArgs.join(" ")}` : "";

  logger.step(`Running ${action} on ${parsed.envName}...`);
  const exitCode = await sshExecStreaming(host, `dust-hive ${action} ${parsed.envName}${flagsStr}`);

  if (exitCode !== 0) {
    return Err(new CommandError(`Failed to ${action} environment`));
  }

  const actionPastTense: Record<string, string> = {
    warm: "warmed",
    cool: "cooled",
    stop: "stopped",
    start: "started",
  };
  logger.success(`Environment ${actionPastTense[action]}`);
  return Ok(undefined);
}

async function handleOpen(args: string[]): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  if (!remoteEnvArg) {
    return Err(new CommandError("Usage: dust-hive remote open <remote/env>"));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env>"));
  }

  if (!(await isSshfsInstalled())) {
    return Err(
      new CommandError(
        "sshfs not installed. Install with: brew install macfuse sshfs\n" +
          "Then allow the kernel extension in System Settings > Privacy & Security"
      )
    );
  }

  const host = await getRemoteHost(parsed.remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${parsed.remoteName}' not found`));
  }

  // Check remote env exists
  logger.step("Checking remote environment...");
  const check = await sshExec(
    host,
    `test -f ~/.dust-hive/envs/${parsed.envName}/metadata.json && echo ok`,
    { timeout: 30000 }
  );
  if (check.stdout.trim() !== "ok") {
    return Err(
      new CommandError(
        `Environment '${parsed.envName}' not found on '${parsed.remoteName}'.\n` +
          `Create it with: dust-hive remote spawn ${parsed.remoteName} --name ${parsed.envName}`
      )
    );
  }

  // Mount SSHFS
  logger.step("Mounting via SSHFS...");
  const mountResult = await mountRemoteEnv(host, parsed.envName);
  if (!mountResult.success) {
    return Err(new CommandError(`Mount failed: ${mountResult.error}`));
  }
  logger.success("Mounted");

  // Get remote port and start IAP tunnels
  logger.step("Starting IAP tunnels...");
  const basePort = (await getRemoteEnvBasePort(host, parsed.envName)) ?? 10000;
  const tunnelResult = await startIapTunnels(host, parsed.envName, basePort);
  if (!tunnelResult.success) {
    return Err(new CommandError(`Tunnels failed: ${tunnelResult.error}`));
  }
  logger.success("Tunnels started");

  // Create Claude skill
  logger.step("Setting up Claude skill...");
  try {
    const skillDir = getRemoteSkillDir(parsed.remoteName, parsed.envName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "skill.md"), generateRemoteSkillContent(host, parsed.envName));
  } catch {
    logger.warn("Could not create Claude skill");
  }

  // Ensure git wrapper
  await ensureGitWrapper();

  // Start zellij
  logger.step("Opening zellij...");
  const compact = args.includes("--compact") || args.includes("-C");
  const layoutPath = await writeRemoteZellijLayout(host, parsed.envName, compact);
  const sessionName = getRemoteZellijSessionName(parsed.remoteName, parsed.envName);

  const sessions = new TextDecoder().decode(
    Bun.spawnSync(["zellij", "list-sessions"], { stdout: "pipe" }).stdout
  );
  const sessionExists = sessions.includes(sessionName);

  restoreTerminal();

  if (sessionExists) {
    Bun.spawnSync(["zellij", "attach", sessionName], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
  } else {
    Bun.spawnSync(["zellij", "--session", sessionName, "--layout", layoutPath], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
  }

  return Ok(undefined);
}

async function handleClose(args: string[]): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  if (!remoteEnvArg) {
    return Err(new CommandError("Usage: dust-hive remote close <remote/env>"));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env>"));
  }

  // Kill zellij session
  const sessionName = getRemoteZellijSessionName(parsed.remoteName, parsed.envName);
  logger.step("Closing zellij session...");
  Bun.spawn(["zellij", "kill-session", sessionName], { stdout: "ignore", stderr: "ignore" });

  // Stop tunnels
  logger.step("Stopping IAP tunnels...");
  await stopIapTunnels(parsed.remoteName, parsed.envName);

  // Unmount
  logger.step("Unmounting SSHFS...");
  const unmountResult = await unmountRemoteEnv(parsed.remoteName, parsed.envName);
  if (!unmountResult.success) {
    logger.warn(`Unmount issue: ${unmountResult.error}`);
  }

  logger.success("Closed");
  return Ok(undefined);
}

async function handleStatus(args: string[]): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  if (!remoteEnvArg) {
    return Err(new CommandError("Usage: dust-hive remote status <remote/env>"));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env>"));
  }

  const host = await getRemoteHost(parsed.remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${parsed.remoteName}' not found`));
  }

  console.log(`\nRemote: ${parsed.remoteName}/${parsed.envName}`);
  console.log("─".repeat(40));

  // SSHFS
  const mountPoint = getRemoteMountPoint(parsed.remoteName, parsed.envName);
  const mounted = await isMounted(mountPoint);
  console.log(`SSHFS:   ${mounted ? "✓ Mounted" : "✗ Not mounted"}`);

  // Tunnels
  const tunnels = await getTunnelsStatus(parsed.remoteName, parsed.envName);
  console.log(`Tunnels: ${tunnels.running ? "✓ Running" : "✗ Not running"}`);

  // Zellij
  const sessionName = getRemoteZellijSessionName(parsed.remoteName, parsed.envName);
  const sessions = new TextDecoder().decode(
    Bun.spawnSync(["zellij", "list-sessions"], { stdout: "pipe" }).stdout
  );
  console.log(`Zellij:  ${sessions.includes(sessionName) ? "✓ Running" : "✗ Not running"}`);

  // Remote status
  console.log("\nRemote environment:");
  const result = await sshExec(host, `dust-hive status ${parsed.envName} 2>&1`, { timeout: 30000 });
  for (const line of result.stdout.trim().split("\n")) {
    console.log(`  ${line}`);
  }

  return Ok(undefined);
}

async function handleSsh(args: string[]): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  if (!remoteEnvArg) {
    return Err(new CommandError("Usage: dust-hive remote ssh <remote/env>"));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env>"));
  }

  const host = await getRemoteHost(parsed.remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${parsed.remoteName}' not found`));
  }

  restoreTerminal();
  const cwd = `/home/${host.remoteUser}/dust-hive/${parsed.envName}`;
  await sshInteractive(host, cwd);

  return Ok(undefined);
}

async function handleExec(args: string[]): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  const command = args.slice(1).join(" ");

  if (!(remoteEnvArg && command)) {
    return Err(new CommandError("Usage: dust-hive remote exec <remote/env> <command>"));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env>"));
  }

  const host = await getRemoteHost(parsed.remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${parsed.remoteName}' not found`));
  }

  const cwd = getRemoteWorktreePath(host, parsed.envName);
  const exitCode = await sshExecStreaming(host, command, { cwd });

  if (exitCode !== 0) {
    return Err(new CommandError(`Command exited with code ${exitCode}`));
  }

  return Ok(undefined);
}

async function handleGit(args: string[]): Promise<Result<void>> {
  const remoteEnvArg = args[0];
  const gitArgs = args.slice(1);

  if (!remoteEnvArg) {
    return Err(new CommandError("Usage: dust-hive remote git <remote/env> <git-args...>"));
  }

  const parsed = parseRemoteEnvArg(remoteEnvArg);
  if (!parsed) {
    return Err(new CommandError("Format: <remote>/<env>"));
  }

  const host = await getRemoteHost(parsed.remoteName);
  if (!host) {
    return Err(new CommandError(`Remote host '${parsed.remoteName}' not found`));
  }

  const translatedArgs = translateArgsToRemote(gitArgs, host, parsed.envName);
  // Shell-quote each argument to preserve boundaries (e.g., commit messages with spaces)
  const quotedArgs = translatedArgs.map((arg) => {
    // If arg contains special chars, wrap in single quotes (escaping any internal single quotes)
    if (/[^a-zA-Z0-9_\-./=@:]/.test(arg)) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  });
  const gitCommand = ["git", ...quotedArgs].join(" ");
  const cwd = getRemoteWorktreePath(host, parsed.envName);

  const exitCode = await sshExecStreaming(host, gitCommand, { cwd, tty: true });

  if (exitCode !== 0) {
    return Err(new CommandError(`git exited with code ${exitCode}`));
  }

  return Ok(undefined);
}

async function ensureGitWrapper(): Promise<void> {
  const binDir = join(DUST_HIVE_HOME, "bin", "remote-git");
  const gitPath = join(binDir, "git");

  await mkdir(binDir, { recursive: true });
  await writeFile(
    gitPath,
    `#!/bin/bash
if [ -z "$DUST_HIVE_REMOTE" ]; then
  exec /usr/bin/git "$@"
fi
exec dust-hive remote git "$DUST_HIVE_REMOTE" "$@"
`,
    { mode: 0o755 }
  );
}

// ============ Main Command Handler ============

export async function remoteCommand(args: string[]): Promise<Result<void>> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  if (!subcommand) {
    showHelp();
    return Ok(undefined);
  }

  switch (subcommand) {
    case "setup":
      return handleSetup(subArgs);
    case "add":
      return handleAdd(subArgs);
    case "list":
    case "ls":
      return handleList();
    case "remove":
    case "rm":
      return handleRemove(subArgs);
    case "envs":
      return handleEnvs(subArgs);
    case "spawn":
      return handleSpawn(subArgs);
    case "start":
      return handleRemoteCommand(subArgs, "start");
    case "warm":
      return handleRemoteCommand(subArgs, "warm");
    case "cool":
      return handleRemoteCommand(subArgs, "cool");
    case "stop":
      return handleRemoteCommand(subArgs, "stop");
    case "open":
      return handleOpen(subArgs);
    case "close":
      return handleClose(subArgs);
    case "status":
      return handleStatus(subArgs);
    case "ssh":
      return handleSsh(subArgs);
    case "exec":
      return handleExec(subArgs);
    case "git":
      return handleGit(subArgs);
    default:
      // Maybe it's a remote/env format for quick open
      if (subcommand.includes("/")) {
        return handleOpen([subcommand, ...subArgs]);
      }
      return Err(
        new CommandError(`Unknown subcommand: ${subcommand}\n\nRun 'dust-hive remote' for help.`)
      );
  }
}
