import { configEnvExists } from "../lib/config";
import { createConfigEnvTemplate } from "../lib/installer";
import { logger } from "../lib/logger";
import { getConfiguredMultiplexer } from "../lib/multiplexer";
import { CONFIG_ENV_PATH, findRepoRoot } from "../lib/paths";
import { getInstallInstructions } from "../lib/platform";
import { confirm } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string | undefined;
  optional?: boolean | undefined; // If true, failing this check doesn't fail the overall doctor
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

async function checkMultiplexer(): Promise<CheckResult> {
  const multiplexer = await getConfiguredMultiplexer();
  const result = await multiplexer.checkInstalled();
  const name = multiplexer.type.charAt(0).toUpperCase() + multiplexer.type.slice(1); // Capitalize

  return {
    name,
    ok: result.ok,
    message: result.ok ? (result.version ?? "Unknown version") : (result.error ?? "Not found"),
    fix: result.ok ? undefined : multiplexer.getInstallInstructions(),
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

async function checkTemporalCli(): Promise<CheckResult> {
  const version = await getCommandVersion("temporal");
  return {
    name: "Temporal CLI",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("temporal"),
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

async function checkCmake(): Promise<CheckResult> {
  const version = await getCommandVersion("cmake");
  return {
    name: "CMake",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("cmake"),
  };
}

async function checkProtobuf(): Promise<CheckResult> {
  const version = await getCommandVersion("protoc");
  return {
    name: "Protobuf",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("protobuf"),
  };
}

async function checkDirenv(): Promise<CheckResult> {
  const version = await getCommandVersion("direnv");
  if (!version) {
    return {
      name: "direnv",
      ok: false,
      message: "Not found",
      fix: getInstallInstructions("direnv"),
    };
  }

  // Check if shell hook is configured by looking for it in shell config files
  const { HOME: home = "" } = process.env;
  const shellConfigs = [".zshrc", ".bashrc", ".bash_profile"];
  let hookConfigured = false;

  for (const configFile of shellConfigs) {
    const configPath = `${home}/${configFile}`;
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const content = await file.text();
      if (content.includes("direnv hook")) {
        hookConfigured = true;
        break;
      }
    }
  }

  if (!hookConfigured) {
    return {
      name: "direnv",
      ok: false,
      message: `${version} (shell hook not configured)`,
      fix: 'Add to your shell config: eval "$(direnv hook $SHELL)" - see README for details',
    };
  }

  return {
    name: "direnv",
    ok: true,
    message: version,
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

async function checkPsql(): Promise<CheckResult> {
  const version = await getCommandVersion("psql");
  return {
    name: "psql",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("psql"),
  };
}

async function checkFzf(): Promise<CheckResult> {
  const version = await getCommandVersion("fzf");
  return {
    name: "fzf",
    ok: version !== null,
    message: version ?? "Not found",
    fix: getInstallInstructions("fzf"),
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
    await checkMultiplexer(),
    await checkDocker(),
    await checkDockerCompose(),
    await checkTemporalCli(),
    await checkPsql(),
    await checkFzf(),
    await checkNvm(),
    await checkCargo(),
    await checkCmake(),
    await checkProtobuf(),
    await checkDirenv(),
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
