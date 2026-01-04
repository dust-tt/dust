import { configEnvExists } from "../lib/config";
import { logger } from "../lib/logger";
import { CONFIG_ENV_PATH, findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
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
    fix: "Install Bun: curl -fsSL https://bun.sh/install | bash",
  };
}

async function checkZellij(): Promise<CheckResult> {
  const version = await getCommandVersion("zellij");
  return {
    name: "Zellij",
    ok: version !== null,
    message: version ?? "Not found",
    fix: "Install Zellij: brew install zellij",
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

async function checkTemporal(): Promise<{ cli: CheckResult; server: CheckResult }> {
  const version = await getCommandVersion("temporal");
  const running = await checkCommand("temporal", ["workflow", "list", "--limit", "1"]);

  return {
    cli: {
      name: "Temporal CLI",
      ok: version !== null,
      message: version ?? "Not found",
      fix: "Install Temporal: brew install temporal",
    },
    server: {
      name: "Temporal Server",
      ok: running,
      message: running ? "Running" : "Not running",
      fix: "Start Temporal: temporal server start-dev",
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
  };
}

async function checkCargo(): Promise<CheckResult> {
  const version = await getCommandVersion("cargo");
  return {
    name: "Cargo",
    ok: version !== null,
    message: version ?? "Not found",
    fix: "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  };
}

async function checkSccache(): Promise<CheckResult> {
  const version = await getCommandVersion("sccache");
  if (!version) {
    return {
      name: "sccache",
      ok: false,
      message: "Not found",
      fix: "Install sccache: brew install sccache",
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
      name: "sccache",
      ok: false,
      message: `${version} (not configured)`,
      fix: configFix,
    };
  }

  const content = await file.text();
  const configured = content.includes("sccache");

  if (configured) {
    return {
      name: "sccache",
      ok: true,
      message: version,
    };
  }

  return {
    name: "sccache",
    ok: false,
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
    const icon = result.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${icon} ${result.name.padEnd(20)} ${result.message}`);
    if (!result.ok) {
      allOk = false;
      if (result.fix) {
        console.log(`    \x1b[90m→ ${result.fix}\x1b[0m`);
      }
    }
  }

  return allOk;
}

export async function doctorCommand(): Promise<Result<void>> {
  logger.info("Checking prerequisites...\n");

  const temporal = await checkTemporal();

  const results: CheckResult[] = [
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

  console.log();
  const allOk = printResults(results);
  console.log();

  if (allOk) {
    logger.success("All prerequisites met!");
    return Ok(undefined);
  }

  logger.warn("Some prerequisites are missing. Please install them to use dust-hive.");
  return Err(new CommandError("Prerequisites check failed"));
}
