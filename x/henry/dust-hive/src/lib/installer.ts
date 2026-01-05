// Installation helpers for dust-hive setup

import { logger } from "./logger";
import { confirm } from "./prompt";

// Check if homebrew is available
export async function hasHomebrew(): Promise<boolean> {
  const proc = Bun.spawn(["which", "brew"], { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  return proc.exitCode === 0;
}

// Installation commands for each prerequisite
// Key must match CheckResult.name exactly
const installCommands: Record<string, { cmd: string; requiresBrew: boolean }> = {
  Homebrew: {
    cmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    requiresBrew: false,
  },
  Bun: {
    cmd: "curl -fsSL https://bun.sh/install | bash",
    requiresBrew: false,
  },
  Zellij: {
    cmd: "brew install zellij",
    requiresBrew: true,
  },
  "Temporal CLI": {
    cmd: "brew install temporal",
    requiresBrew: true,
  },
  nvm: {
    cmd: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash",
    requiresBrew: false,
  },
  Cargo: {
    cmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
    requiresBrew: false,
  },
  "sccache (optional)": {
    cmd: "brew install sccache",
    requiresBrew: true,
  },
};

// Run a shell command and return success status
async function runShellCommand(cmd: string): Promise<boolean> {
  logger.info(`→ Running: ${cmd}`);
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Configure sccache in cargo config after installation
async function configureSccache(): Promise<void> {
  const { HOME: home = "" } = process.env;
  const configPath = `${home}/.cargo/config.toml`;
  const file = Bun.file(configPath);

  let content = "";
  if (await file.exists()) {
    content = await file.text();
  }

  if (!content.includes("sccache")) {
    const sccacheConfig = '\n[build]\nrustc-wrapper = "sccache"\n';
    await Bun.write(configPath, content + sccacheConfig);
    logger.info("→ Configured sccache in ~/.cargo/config.toml");
  }
}

// Attempt to install a prerequisite interactively
export async function tryInstall(
  name: string,
  optional: boolean,
  hasBrew: boolean
): Promise<boolean> {
  const installer = installCommands[name];
  if (!installer) {
    return false;
  }

  if (installer.requiresBrew && !hasBrew) {
    logger.warn(`${name} requires Homebrew, which is not installed`);
    return false;
  }

  const defaultYes = !optional;
  const suffix = optional ? " (optional)" : "";
  const confirmed = await confirm(`Install ${name}${suffix}?`, defaultYes);

  if (!confirmed) {
    logger.info("→ Skipped");
    return false;
  }

  const success = await runShellCommand(installer.cmd);

  if (success) {
    logger.success(`${name} installed`);

    // Post-install: configure sccache if we just installed it
    if (name === "sccache (optional)") {
      await configureSccache();
    }
  } else {
    logger.error(`Failed to install ${name}`);
  }

  return success;
}

// Check if a prerequisite has an installer
export function hasInstaller(name: string): boolean {
  return name in installCommands;
}

// Create config.env template
export async function createConfigEnvTemplate(configPath: string): Promise<boolean> {
  // Template uses export statements as required by env.sh sourcing
  // See local-dev-setup.md for the full list of required variables
  const template = `# dust-hive configuration
# This file is sourced by env.sh - use 'export VAR=value' syntax
# See local-dev-setup.md for the full list of required variables

# Copy your environment variables from your existing .env file here
# Example:
# export OPENAI_API_KEY=sk-...
# export DUST_API_KEY=...
`;

  await Bun.write(configPath, template);
  logger.success(`Created config template at ${configPath}`);
  logger.info("→ Please copy your environment variables from your existing .env file");
  return true;
}
