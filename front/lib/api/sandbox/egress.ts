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
const EGRESS_FORWARDER_LOG_PATH = "/tmp/dust-forwarder.log";
const EGRESS_SETUP_WAIT_RETRIES = 6;
const EGRESS_SETUP_WAIT_MS = 500;
const EGRESS_JWT_TTL_SECONDS = 24 * 60 * 60;

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

export function mintEgressJwt(providerId: string): string {
  return jwt.sign(
    {
      iss: "dust-front",
      aud: "dust-egress-proxy",
      sbId: providerId,
    },
    config.getEgressProxyJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: EGRESS_JWT_TTL_SECONDS,
    }
  );
}

export async function sandboxSupportsEgressForwarding(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<boolean, Error>> {
  const probeResult = await sandbox.exec(
    auth,
    "test -d /etc/dust && id agent-proxied >/dev/null 2>&1 && id dust-fwd >/dev/null 2>&1 && command -v dsbx >/dev/null 2>&1"
  );

  if (probeResult.isErr()) {
    return probeResult;
  }

  return new Ok(probeResult.value.exitCode === 0);
}

export async function checkEgressForwarderHealth(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<boolean, Error>> {
  const healthResult = await sandbox.exec(auth, "nc -z 127.0.0.1 9990", {
    timeoutMs: 1_000,
  });

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

  const token = mintEgressJwt(sandbox.providerId);
  const tokenWriteResult = await sandbox.writeFile(
    auth,
    EGRESS_TOKEN_PATH,
    new TextEncoder().encode(token).buffer
  );
  if (tokenWriteResult.isErr()) {
    return tokenWriteResult;
  }

  const chmodResult = await runSuccessfulSandboxCommand(
    auth,
    sandbox,
    `chown dust-fwd:dust-fwd ${shellEscape(EGRESS_TOKEN_PATH)} && chmod 600 ${shellEscape(EGRESS_TOKEN_PATH)}`,
    "root"
  );
  if (chmodResult.isErr()) {
    return chmodResult;
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
