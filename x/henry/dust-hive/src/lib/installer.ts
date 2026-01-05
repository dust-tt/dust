// Installation helpers for dust-hive setup
// Handles automatic installation of prerequisites

import { logger } from "./logger";
import { confirm } from "./prompt";

export interface InstallResult {
  success: boolean;
  message: string;
}

// Check if a command exists and is executable
async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// Check if homebrew is available
export async function hasHomebrew(): Promise<boolean> {
  return commandExists("brew");
}

// Run an installation command with progress output
export async function runInstall(
  name: string,
  command: string[],
  options?: { shell?: boolean }
): Promise<InstallResult> {
  const displayCommand = command.join(" ");
  logger.info(`→ Running: ${displayCommand}`);

  try {
    let proc: ReturnType<typeof Bun.spawn>;

    if (options?.shell) {
      // For commands that need shell execution (pipes, etc.)
      proc = Bun.spawn(["bash", "-c", command.join(" ")], {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      });
    } else {
      proc = Bun.spawn(command, {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      });
    }

    await proc.exited;

    if (proc.exitCode === 0) {
      logger.success(`${name} installed`);
      return { success: true, message: `${name} installed successfully` };
    }
    return { success: false, message: `Installation failed with exit code ${proc.exitCode}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}

// Install homebrew if not present
export async function installHomebrew(): Promise<InstallResult> {
  const script =
    '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
  return runInstall("Homebrew", [script], { shell: true });
}

// Install bun
export async function installBun(): Promise<InstallResult> {
  return runInstall("Bun", ["curl", "-fsSL", "https://bun.sh/install", "|", "bash"], {
    shell: true,
  });
}

// Install zellij via homebrew
export async function installZellij(): Promise<InstallResult> {
  return runInstall("Zellij", ["brew", "install", "zellij"]);
}

// Install temporal CLI via homebrew
export async function installTemporal(): Promise<InstallResult> {
  return runInstall("Temporal CLI", ["brew", "install", "temporal"]);
}

// Install nvm
export async function installNvm(): Promise<InstallResult> {
  const script = "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash";
  return runInstall("nvm", [script], { shell: true });
}

// Install cargo (rustup)
export async function installCargo(): Promise<InstallResult> {
  const script = 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y';
  return runInstall("Cargo", [script], { shell: true });
}

// Install sccache via homebrew
export async function installSccache(): Promise<InstallResult> {
  const result = await runInstall("sccache", ["brew", "install", "sccache"]);
  if (!result.success) {
    return result;
  }

  // Configure sccache in cargo config
  const { HOME: home = "" } = process.env;
  const configPath = `${home}/.cargo/config.toml`;
  const file = Bun.file(configPath);

  try {
    let content = "";
    if (await file.exists()) {
      content = await file.text();
    }

    if (!content.includes("sccache")) {
      const sccacheConfig = '\n[build]\nrustc-wrapper = "sccache"\n';
      await Bun.write(configPath, content + sccacheConfig);
      logger.info("→ Configured sccache in ~/.cargo/config.toml");
    }
  } catch {
    logger.warn("Could not configure sccache in cargo config");
  }

  return result;
}

// Create config.env template
export async function createConfigEnvTemplate(configPath: string): Promise<InstallResult> {
  const template = `# dust-hive configuration
# Fill in the required values below

# Required: Your Dust API credentials
DUST_CLIENT_ID=
DUST_CLIENT_SECRET=

# Required: OpenAI API key for embeddings
OPENAI_API_KEY=

# Optional: Anthropic API key
ANTHROPIC_API_KEY=

# Optional: Other API keys as needed
# GITHUB_TOKEN=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
`;

  try {
    await Bun.write(configPath, template);
    logger.success(`Created config template at ${configPath}`);
    logger.info("→ Please edit the file and add your credentials");
    return { success: true, message: "Config template created" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}

// Installer registry - maps check names to their installers
export interface Installer {
  name: string;
  requiresBrew: boolean;
  install: () => Promise<InstallResult>;
}

export const installers: Record<string, Installer> = {
  Homebrew: {
    name: "Homebrew",
    requiresBrew: false,
    install: installHomebrew,
  },
  Bun: {
    name: "Bun",
    requiresBrew: false,
    install: installBun,
  },
  Zellij: {
    name: "Zellij",
    requiresBrew: true,
    install: installZellij,
  },
  "Temporal CLI": {
    name: "Temporal CLI",
    requiresBrew: true,
    install: installTemporal,
  },
  nvm: {
    name: "nvm",
    requiresBrew: false,
    install: installNvm,
  },
  Cargo: {
    name: "Cargo",
    requiresBrew: false,
    install: installCargo,
  },
  "sccache (optional)": {
    name: "sccache",
    requiresBrew: true,
    install: installSccache,
  },
};

// Attempt to install a prerequisite interactively
export async function tryInstall(
  name: string,
  optional: boolean,
  hasBrew: boolean
): Promise<boolean> {
  const installer = installers[name];
  if (!installer) {
    return false;
  }

  // Check if homebrew is needed but missing
  if (installer.requiresBrew && !hasBrew) {
    logger.warn(`${name} requires Homebrew, which is not installed`);
    return false;
  }

  // Ask for confirmation
  const defaultYes = !optional;
  const suffix = optional ? " (optional)" : "";
  const confirmed = await confirm(`Install ${installer.name}${suffix}?`, defaultYes);

  if (!confirmed) {
    logger.info("→ Skipped");
    return false;
  }

  const result = await installer.install();
  return result.success;
}
