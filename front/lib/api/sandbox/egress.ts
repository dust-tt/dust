import { lookup } from "node:dns/promises";
import config from "@app/lib/api/config";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { Err, Ok, type Result } from "@app/types/shared/result";
import jwt from "jsonwebtoken";

const EGRESS_FORWARDER_LISTEN_ADDR = "127.0.0.1:9990";
const EGRESS_TOKEN_PATH = "/etc/dust/egress-token";
const EGRESS_DENY_LOG_PATH = "/tmp/dust-egress-denied.log";
const EGRESS_DENY_LOG_OFFSET_PATH = "/tmp/.dust-egress-deny-offset";
const EGRESS_FORWARDER_LOG_PATH = "/tmp/dust-forwarder.log";
const EGRESS_SETUP_WAIT_RETRIES = 6;
const EGRESS_SETUP_WAIT_MS = 500;
const EGRESS_JWT_TTL_SECONDS = 24 * 60 * 60;
const MAX_DENY_LOG_LINES_PER_EXEC = 20;

const REGION_PROXY_PREFIX = {
  "europe-west1": "eu",
  "us-central1": "us",
} as const;

function getDefaultProxyHost(): string {
  const region = regionConfig.getCurrentRegion();
  return `${REGION_PROXY_PREFIX[region]}.sandbox-egress.dust.tt`;
}

function getProxyHost(): string {
  return config.getEgressProxyHost() ?? getDefaultProxyHost();
}

function getProxyTlsName(): string {
  return config.getEgressProxyTlsName() ?? getProxyHost();
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function resolveProxyAddr(): Promise<string> {
  const proxyHost = getProxyHost();
  const { address } = await lookup(proxyHost, { family: 4 });
  return address;
}

async function runSuccessfulSandboxCommand(
  auth: Authenticator,
  sandbox: SandboxResource,
  command: string,
  user?: string
): Promise<Result<void, Error>> {
  const result = await sandbox.exec(auth, command, user ? { user } : undefined);
  if (result.isErr()) {
    return result;
  }

  if (result.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Sandbox command failed with exit code ${result.value.exitCode}: ${result.value.stderr || result.value.stdout || command}`
      )
    );
  }

  return new Ok(undefined);
}

export function mintEgressJwt(providerId: string, workspaceId: string): string {
  return jwt.sign(
    {
      iss: "dust-front",
      aud: "dust-egress-proxy",
      sbId: providerId,
      wId: workspaceId,
    },
    config.getEgressProxyJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: EGRESS_JWT_TTL_SECONDS,
    }
  );
}

export async function checkEgressForwarderHealth(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<boolean, Error>> {
  // Use ss to check if the port is bound locally rather than nc -z which opens
  // a real TCP connection through the forwarder, triggering a proxy round-trip
  // and noisy <unknown> deny log entries on every health check.
  const healthResult = await sandbox.exec(
    auth,
    "ss -tln sport = :9990 | grep -q LISTEN",
    { timeoutMs: 1_000 }
  );

  if (healthResult.isErr()) {
    return healthResult;
  }

  return new Ok(healthResult.value.exitCode === 0);
}

export async function setupEgressForwarder(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const logContext = {
    event: "egress.setup",
    providerId: sandbox.providerId,
    sandboxId: sandbox.sId,
  };

  let proxyAddr: string;
  try {
    proxyAddr = await resolveProxyAddr();
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }

  const token = mintEgressJwt(
    sandbox.providerId,
    auth.getNonNullableWorkspace().sId
  );
  const tokenWriteResult = await sandbox.writeFile(
    auth,
    EGRESS_TOKEN_PATH,
    new TextEncoder().encode(token).buffer
  );
  if (tokenWriteResult.isErr()) {
    return tokenWriteResult;
  }

  // Older sandboxes may still have root-owned log files from before the
  // forwarder switched to dust-fwd, so clear them before dropping privileges.
  const prepareRuntimeFilesResult = await runSuccessfulSandboxCommand(
    auth,
    sandbox,
    `chown dust-fwd:dust-fwd ${shellEscape(EGRESS_TOKEN_PATH)} && ` +
      `chmod 600 ${shellEscape(EGRESS_TOKEN_PATH)} && ` +
      `rm -f ${shellEscape(EGRESS_FORWARDER_LOG_PATH)} ${shellEscape(EGRESS_DENY_LOG_PATH)}`,
    "root"
  );
  if (prepareRuntimeFilesResult.isErr()) {
    return prepareRuntimeFilesResult;
  }

  const startForwarderCommand =
    "nohup /opt/bin/dsbx forward " +
    `--token-file ${shellEscape(EGRESS_TOKEN_PATH)} ` +
    `--proxy-addr ${shellEscape(`${proxyAddr}:${config.getEgressProxyPort()}`)} ` +
    `--proxy-tls-name ${shellEscape(getProxyTlsName())} ` +
    `--listen ${shellEscape(EGRESS_FORWARDER_LISTEN_ADDR)} ` +
    `--deny-log ${shellEscape(EGRESS_DENY_LOG_PATH)} ` +
    `>${shellEscape(EGRESS_FORWARDER_LOG_PATH)} 2>&1 &`;

  const startResult = await runSuccessfulSandboxCommand(
    auth,
    sandbox,
    startForwarderCommand,
    "dust-fwd"
  );
  if (startResult.isErr()) {
    return startResult;
  }

  for (let i = 0; i < EGRESS_SETUP_WAIT_RETRIES; i++) {
    const healthResult = await checkEgressForwarderHealth(auth, sandbox);
    if (healthResult.isErr()) {
      return healthResult;
    }
    if (healthResult.value) {
      logger.info(logContext, "Sandbox egress forwarder is healthy");
      return new Ok(undefined);
    }

    await sleep(EGRESS_SETUP_WAIT_MS);
  }

  return new Err(
    new Error("Sandbox egress forwarder did not become healthy in time")
  );
}

// Best-effort, sandbox-global deny log surfacing. The offset tracks lines
// consumed across all exec calls, so entries returned here are "new since the
// last read", not strictly caused by the command that just ran.
export async function readNewDenyLogEntries(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<string[], Error>> {
  const command =
    `_off=$(cat ${shellEscape(EGRESS_DENY_LOG_OFFSET_PATH)} 2>/dev/null || echo 0); ` +
    `_total=$(wc -l < ${shellEscape(EGRESS_DENY_LOG_PATH)} 2>/dev/null || echo 0); ` +
    `if [ "$_total" -gt "$_off" ]; then ` +
    `tail -n +$((_off + 1)) ${shellEscape(EGRESS_DENY_LOG_PATH)} | head -n ${MAX_DENY_LOG_LINES_PER_EXEC}; ` +
    `fi; ` +
    `echo "$_total" > ${shellEscape(EGRESS_DENY_LOG_OFFSET_PATH)}`;

  const result = await sandbox.exec(auth, command, {
    user: "root",
    timeoutMs: 2_000,
  });

  if (result.isErr()) {
    return result;
  }

  const lines = result.value.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0);

  return new Ok(lines);
}
