import { configEnvExists } from "../lib/config";
import { createConfigEnvTemplate, hasHomebrew, hasInstaller, tryInstall } from "../lib/installer";
import { logger } from "../lib/logger";
import { CONFIG_ENV_PATH, findRepoRoot } from "../lib/paths";
import { confirm } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
  optional?: boolean; // If true, failing this check doesn't fail the overall doctor
  installable?: boolean; // If true, we can offer to install this
}

export interface SetupOptions {
  nonInteractive?: boolean;
}

async function checkCommand(command: string, args: string[] = []): Promise<boolean> {
  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    // Command not found or failed to execute - treat as check failure
    return false;
  }
}

async function getCommandVersion(command: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([command, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const firstLine = output.trim().split("\n")[0];
    return proc.exitCode === 0 ? (firstLine ?? null) : null;
  } catch {
    // Command not found or failed to execute
    return null;
  }
}

async function checkHomebrew(): Promise<CheckResult> {
  const exists = await hasHomebrew();
  return {
    name: "Homebrew",
    ok: exists,
    message: exists ? "Available" : "Not found",
    fix: "Install Homebrew: https://brew.sh",
    installable: true,
  };
}

async function checkBun(): Promise<CheckResult> {
  const version = await getCommandVersion("bun");
  return {
    name: "Bun",
    ok: version !== null,
    message: version ?? "Not found",
    fix: "Install Bun: curl -fsSL https://bun.sh/install | bash",
    installable: true,
  };
}

async function checkZellij(): Promise<CheckResult> {
  const version = await getCommandVersion("zellij");
  return {
    name: "Zellij",
    ok: version !== null,
    message: version ?? "Not found",
    fix: "Install Zellij: brew install zellij",
    installable: true,
  };
}

async function checkDocker(): Promise<CheckResult> {
  const version = await getCommandVersion("docker");
  const running = await checkCommand("docker", ["info"]);
  const message = running ? (version ?? "Unknown version") : version ? "Not running" : "Not found";
  return {
    name: "Docker",
    ok: version !== null && running,
    message,
    fix: version ? "Start Docker Desktop" : "Install Docker Desktop",
    installable: false,
  };
}

async function checkDockerCompose(): Promise<CheckResult> {
  const available = await checkCommand("docker", ["compose", "version"]);
  return {
    name: "Docker Compose",
    ok: available,
    message: available ? "Available" : "Not available",
    fix: "Docker Compose should be included with Docker Desktop",
    installable: false,
  };
}

async function checkTemporal(): Promise<{ cli: CheckResult; server: CheckResult }> {
  const version = await getCommandVersion("temporal");
  const running = await checkCommand("temporal", ["workflow", "list", "--limit", "1"]);

  return {
    cli: {
      name: "Temporal CLI",
      ok: version !== null,
      message: version ?? "Not found",
      fix: "Install Temporal: brew install temporal",
      installable: true,
    },
    server: {
      name: "Temporal Server",
      ok: running,
      message: running ? "Running" : "Not running",
      fix: "Start Temporal: temporal server start-dev",
      installable: false,
    },
  };
}

async function checkNvm(): Promise<CheckResult> {
  const exists = await checkCommand("bash", ["-c", "source ~/.nvm/nvm.sh && nvm --version"]);
  return {
    name: "nvm",
    ok: exists,
    message: exists ? "Available" : "Not found",
    fix: "Install nvm: https://github.com/nvm-sh/nvm",
    installable: true,
  };
}

async function checkCargo(): Promise<CheckResult> {
  const version = await getCommandVersion("cargo");
  return {
    name: "Cargo",
    ok: version !== null,
    message: version ?? "Not found",
    fix: "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    installable: true,
  };
}

async function checkSccache(): Promise<CheckResult> {
  const version = await getCommandVersion("sccache");
  if (!version) {
    return {
      name: "sccache (optional)",
      ok: false,
      optional: true,
      message: "Not found (recommended for faster rebuilds)",
      fix: "Install sccache: brew install sccache",
      installable: true,
    };
  }

  // Check if sccache is configured in cargo
  const { HOME: home = "" } = process.env;
  const configPath = `${home}/.cargo/config.toml`;
  const file = Bun.file(configPath);
  const exists = await file.exists();
  const configFix = `Add to ${configPath}:\n[build]\nrustc-wrapper = "sccache"`;

  if (!exists) {
    return {
      name: "sccache (optional)",
      ok: false,
      optional: true,
      message: `${version} (not configured)`,
      fix: configFix,
      installable: true,
    };
  }

  const content = await file.text();
  const configured = content.includes("sccache");

  if (configured) {
    return {
      name: "sccache (optional)",
      ok: true,
      message: version,
    };
  }

  return {
    name: "sccache (optional)",
    ok: false,
    optional: true,
    message: `${version} (not configured)`,
    fix: configFix,
    installable: true,
  };
}

async function checkRepo(): Promise<CheckResult> {
  const root = await findRepoRoot();
  return {
    name: "Dust Repo",
    ok: root !== null,
    message: root ?? "Not found",
    fix: "Run dust-hive from within the Dust repository",
    installable: false,
  };
}

async function checkConfig(): Promise<CheckResult> {
  const exists = await configEnvExists();
  return {
    name: "config.env",
    ok: exists,
    message: exists ? CONFIG_ENV_PATH : "Not found",
    fix: `Create ${CONFIG_ENV_PATH} with required environment variables`,
    installable: true,
  };
}

function printResults(results: CheckResult[]): boolean {
  console.log("Prerequisites:");
  console.log();

  let allOk = true;
  for (const result of results) {
    const icon = result.ok
      ? "\x1b[32m✓\x1b[0m"
      : result.optional
        ? "\x1b[33m○\x1b[0m"
        : "\x1b[31m✗\x1b[0m";
    console.log(`  ${icon} ${result.name.padEnd(20)} ${result.message}`);
    if (!result.ok) {
      if (!result.optional) {
        allOk = false;
      }
      if (result.fix) {
        console.log(`    \x1b[90m→ ${result.fix}\x1b[0m`);
      }
    }
  }

  return allOk;
}

async function runAllChecks(): Promise<CheckResult[]> {
  const temporal = await checkTemporal();

  return [
    await checkHomebrew(),
    await checkBun(),
    await checkZellij(),
    await checkDocker(),
    await checkDockerCompose(),
    temporal.cli,
    temporal.server,
    await checkNvm(),
    await checkCargo(),
    await checkSccache(),
    await checkRepo(),
    await checkConfig(),
  ];
}

function getInstallableFailures(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => !r.ok && r.installable);
}

function getManualFailures(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => !(r.ok || r.installable || r.optional));
}

async function installConfigEnv(): Promise<boolean> {
  const shouldCreate = await confirm("Create config.env template?", true);
  if (!shouldCreate) {
    logger.info("→ Skipped");
    return false;
  }
  await createConfigEnvTemplate(CONFIG_ENV_PATH);
  return true;
}

async function installPrerequisite(
  check: CheckResult,
  hasBrew: boolean
): Promise<{ installed: boolean; brewInstalled: boolean }> {
  if (!hasInstaller(check.name)) {
    return { installed: false, brewInstalled: false };
  }

  const installed = await tryInstall(check.name, check.optional ?? false, hasBrew);
  const brewInstalled = installed && check.name === "Homebrew";
  return { installed, brewInstalled };
}

async function interactiveInstall(results: CheckResult[]): Promise<boolean> {
  const installable = getInstallableFailures(results);
  if (installable.length === 0) {
    return false;
  }

  console.log();
  logger.info("Some prerequisites can be installed automatically.\n");

  const brewCheck = results.find((r) => r.name === "Homebrew");
  let hasBrew = brewCheck?.ok ?? false;
  let anyInstalled = false;

  for (const check of installable) {
    if (check.name === "config.env") {
      anyInstalled = (await installConfigEnv()) || anyInstalled;
      continue;
    }

    const result = await installPrerequisite(check, hasBrew);
    anyInstalled = result.installed || anyInstalled;
    hasBrew = result.brewInstalled || hasBrew;
  }

  return anyInstalled;
}

export async function setupCommand(options: SetupOptions = {}): Promise<Result<void>> {
  logger.info("Checking prerequisites...\n");

  let results = await runAllChecks();

  console.log();
  let allOk = printResults(results);
  console.log();

  if (allOk) {
    logger.success("All prerequisites met!");
    return Ok(undefined);
  }

  // In non-interactive mode, just report and exit
  if (options.nonInteractive) {
    logger.warn("Some prerequisites are missing. Please install them to use dust-hive.");
    return Err(new CommandError("Prerequisites check failed"));
  }

  // Interactive mode: offer to install what we can
  const anyInstalled = await interactiveInstall(results);

  if (anyInstalled) {
    // Re-run checks after installations
    console.log();
    logger.info("Re-checking prerequisites...\n");
    results = await runAllChecks();
    console.log();
    allOk = printResults(results);
    console.log();
  }

  if (allOk) {
    logger.success("All prerequisites met!");
    return Ok(undefined);
  }

  // Report remaining manual fixes needed
  const manualFixes = getManualFailures(results);
  if (manualFixes.length > 0) {
    logger.warn("Some prerequisites require manual action:");
    for (const fix of manualFixes) {
      if (fix.fix) {
        console.log(`  • ${fix.name}: ${fix.fix}`);
      }
    }
    console.log();
  }

  logger.info("Ready to create environments once all prerequisites are met!");
  return Err(new CommandError("Prerequisites check failed"));
}

// Alias for backwards compatibility
export async function doctorCommand(): Promise<Result<void>> {
  return setupCommand({ nonInteractive: false });
}
