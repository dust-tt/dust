import { configEnvExists } from "../lib/config";
import { createConfigEnvTemplate } from "../lib/installer";
import { logger } from "../lib/logger";
import { CONFIG_ENV_PATH, findRepoRoot } from "../lib/paths";
import { getInstallInstructions } from "../lib/platform";
import { confirm } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
  optional?: boolean; // If true, failing this check doesn't fail the overall doctor
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

async function checkBun(): Promise<CheckResult> {
  const version = await getCommandVersion("bun");
  return {
    name: "Bun",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("bun"),
  };
}

async function checkLsof(): Promise<CheckResult> {
  const exists = await checkCommand("lsof", ["-v"]);
  return {
    name: "lsof",
    ok: exists,
    message: exists ? "Available" : "Not found",
    fix: getInstallInstructions("lsof"),
  };
}

async function checkZellij(): Promise<CheckResult> {
  const version = await getCommandVersion("zellij");
  return {
    name: "Zellij",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("zellij"),
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
    fix: version
      ? "Start Docker Desktop"
      : "Install Docker Desktop: https://docs.docker.com/get-docker/",
  };
}

async function checkDockerCompose(): Promise<CheckResult> {
  const available = await checkCommand("docker", ["compose", "version"]);
  return {
    name: "Docker Compose",
    ok: available,
    message: available ? "Available" : "Not available",
    fix: "Docker Compose should be included with Docker Desktop",
  };
}

const TEMPORAL_MIN_VERSION = "0.12.0";

function parseVersion(versionString: string): number[] | null {
  // Extract version number from strings like "temporal version 0.12.0" or "0.12.0"
  const match = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionAtLeast(version: number[], minVersion: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if ((version[i] ?? 0) > (minVersion[i] ?? 0)) return true;
    if ((version[i] ?? 0) < (minVersion[i] ?? 0)) return false;
  }
  return true; // Equal versions
}

async function checkTemporalCli(): Promise<CheckResult> {
  const versionOutput = await getCommandVersion("temporal");
  if (!versionOutput) {
    return {
      name: "Temporal CLI",
      ok: false,
      message: "Not found",
      fix: getInstallInstructions("temporal"),
    };
  }

  const version = parseVersion(versionOutput);
  const minVersion = parseVersion(TEMPORAL_MIN_VERSION);

  if (!(version && minVersion)) {
    return {
      name: "Temporal CLI",
      ok: false,
      message: `${versionOutput} (unable to parse version)`,
      fix: getInstallInstructions("temporal"),
    };
  }

  const meetsMinimum = isVersionAtLeast(version, minVersion);
  const versionStr = version.join(".");

  if (meetsMinimum) {
    return {
      name: "Temporal CLI",
      ok: true,
      message: versionOutput,
    };
  }

  return {
    name: "Temporal CLI",
    ok: false,
    message: `${versionStr} (requires >= ${TEMPORAL_MIN_VERSION})`,
    fix: `Upgrade temporal CLI: ${getInstallInstructions("temporal")}`,
  };
}

async function checkNvm(): Promise<CheckResult> {
  const exists = await checkCommand("bash", ["-c", "source ~/.nvm/nvm.sh && nvm --version"]);
  return {
    name: "nvm",
    ok: exists,
    message: exists ? "Available" : "Not found",
    fix: getInstallInstructions("nvm"),
  };
}

async function checkCargo(): Promise<CheckResult> {
  const version = await getCommandVersion("cargo");
  return {
    name: "Cargo",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("cargo"),
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
      fix: getInstallInstructions("sccache"),
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
  };
}

async function checkRepo(): Promise<CheckResult> {
  const root = await findRepoRoot();
  return {
    name: "Dust Repo",
    ok: root !== null,
    message: root ?? "Not found",
    fix: "Run dust-hive from within the Dust repository",
  };
}

async function checkConfig(): Promise<CheckResult> {
  const exists = await configEnvExists();
  return {
    name: "config.env",
    ok: exists,
    message: exists ? CONFIG_ENV_PATH : "Not found",
    fix: `Create ${CONFIG_ENV_PATH} with required environment variables`,
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
  return [
    await checkBun(),
    await checkLsof(),
    await checkZellij(),
    await checkDocker(),
    await checkDockerCompose(),
    await checkTemporalCli(),
    await checkNvm(),
    await checkCargo(),
    await checkSccache(),
    await checkRepo(),
    await checkConfig(),
  ];
}

async function offerConfigEnvCreation(): Promise<boolean> {
  const shouldCreate = await confirm("Create config.env template?", true);
  if (!shouldCreate) {
    logger.info("→ Skipped");
    return false;
  }
  await createConfigEnvTemplate(CONFIG_ENV_PATH);
  return true;
}

export async function setupCommand(options: SetupOptions = {}): Promise<Result<void>> {
  logger.info("Checking prerequisites...\n");

  let results = await runAllChecks();

  console.log();
  let allOk = printResults(results);
  console.log();

  if (allOk) {
    logger.success("All prerequisites met!");
    console.log();
    console.log("Next steps:");
    console.log("  dust-hive up            # Start temporal server + sync main repo");
    console.log("  dust-hive spawn <name>  # Create a new environment");
    console.log();
    return Ok(undefined);
  }

  // Check if only config.env is missing and offer to create it (interactive only)
  const configCheck = results.find((r) => r.name === "config.env");
  if (!options.nonInteractive && configCheck && !configCheck.ok) {
    console.log();
    const created = await offerConfigEnvCreation();
    if (created) {
      // Re-run checks after config creation
      console.log();
      logger.info("Re-checking prerequisites...\n");
      results = await runAllChecks();
      console.log();
      allOk = printResults(results);
      console.log();

      if (allOk) {
        logger.success("All prerequisites met!");
        console.log();
        console.log("Next steps:");
        console.log("  dust-hive up            # Start temporal server + sync main repo");
        console.log("  dust-hive spawn <name>  # Create a new environment");
        console.log();
        return Ok(undefined);
      }
    }
  }

  // Report failure
  if (options.nonInteractive) {
    logger.warn("Some prerequisites are missing. Please install them to use dust-hive.");
  } else {
    logger.info("Once prerequisites are met, run: dust-hive up");
  }
  return Err(new CommandError("Prerequisites check failed"));
}

// Alias for backwards compatibility
export async function doctorCommand(): Promise<Result<void>> {
  return setupCommand({ nonInteractive: false });
}
