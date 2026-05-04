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
const EGRESS_SETUP_HEALTH_TIMEOUT_SECONDS = 3;
const EGRESS_SETUP_TIMEOUT_MS = 5_000;
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

async function resolveProxyAddr(): Promise<string> {
  const proxyHost = getProxyHost();
  const { address } = await lookup(proxyHost, { family: 4 });
  return address;
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

const INVALIDATION_JWT_TTL_SECONDS = 60;

export function mintEgressInvalidationJwt({
  workspaceId,
  sandboxId,
}: {
  workspaceId?: string;
  sandboxId?: string;
}): string {
  return jwt.sign(
    {
      iss: "dust-front",
      aud: "dust-egress-proxy",
      action: "invalidate-policy",
      ...(workspaceId ? { wId: workspaceId } : {}),
      ...(sandboxId ? { sbId: sandboxId } : {}),
    },
    config.getEgressProxyJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: INVALIDATION_JWT_TTL_SECONDS,
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

  const setupScript = buildEgressSetupScript({ token, proxyAddr });
  const result = await sandbox.exec(auth, setupScript, {
    user: "root",
    timeoutMs: EGRESS_SETUP_TIMEOUT_MS,
  });
  if (result.isErr()) {
    return result;
  }

  if (result.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Egress setup script exited with code ${result.value.exitCode}: ${result.value.stderr}`
      )
    );
  }

  logger.info(logContext, "Sandbox egress forwarder is healthy");
  return new Ok(undefined);
}

function buildEgressSetupScript({
  token,
  proxyAddr,
}: {
  token: string;
  proxyAddr: string;
}): string {
  const dsbxCommand =
    "nohup /opt/bin/dsbx forward " +
    `--token-file ${shellEscape(EGRESS_TOKEN_PATH)} ` +
    `--proxy-addr ${shellEscape(`${proxyAddr}:${config.getEgressProxyPort()}`)} ` +
    `--proxy-tls-name ${shellEscape(getProxyTlsName())} ` +
    `--listen ${shellEscape(EGRESS_FORWARDER_LISTEN_ADDR)} ` +
    `--deny-log ${shellEscape(EGRESS_DENY_LOG_PATH)} ` +
    `>${shellEscape(EGRESS_FORWARDER_LOG_PATH)} 2>&1 &`;

  return `set -e
mkdir -p /etc/dust
printf '%s' ${shellEscape(token)} > ${EGRESS_TOKEN_PATH}
chmod 600 ${EGRESS_TOKEN_PATH}
${dsbxCommand}
deadline=$(( $(date +%s) + ${EGRESS_SETUP_HEALTH_TIMEOUT_SECONDS} ))
while true; do
  if ss -tln sport = :9990 | grep -q LISTEN; then
    exit 0
  fi
  if [ $(date +%s) -ge $deadline ]; then
    echo "Egress forwarder not healthy after ${EGRESS_SETUP_HEALTH_TIMEOUT_SECONDS}s" >&2
    exit 42
  fi
  sleep 0.05
done`;
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
