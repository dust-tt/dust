import { lookup } from "node:dns/promises";
import config from "@app/lib/api/config";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { writeEgressSecretsFile } from "@app/lib/api/sandbox/egress_secrets";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
// dsbx exits on SIGTERM almost immediately; this grace just lets in-flight
// TLS handshakes finish before SIGKILL. Embedded as a literal in the kill
// command since /bin/sh `sleep` takes seconds, not ms.
const DSBX_TERM_GRACE_SECONDS = 0.2;

// Paths used for the per-sandbox MITM CA. dsbx owns /run/dust/egress-ca.pem
// and persists it across dsbx restarts while the sandbox is awake. /run is
// tmpfs, so sleep+wake clears it and a fresh CA is minted on next setup.
const MITM_CA_PATH = "/run/dust/egress-ca.pem";
const MITM_CA_BUNDLE_PATH = "/etc/dust/ca-bundle.pem";
const MITM_SYSTEM_CA_DEST = "/usr/local/share/ca-certificates/dust-egress.crt";
const MITM_SYSTEM_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt";

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

// Egress prep that runs before GCS mounts: in prod, starts the forwarder; in
// dev-unrestricted mode, tears down the in-sandbox nftables redirect so
// traffic flows direct out of the (now permissive) E2B network. Pairs with
// the network policy chosen in getSandboxImage().
export async function prepareSandboxEgressBeforeMount(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  if (config.getSandboxDevUnrestrictedEgress()) {
    return teardownInSandboxEgressRedirect(auth, sandbox);
  }
  return setupEgressForwarder(auth, sandbox);
}

// Egress check that runs after GCS mounts on every exec: in prod, verifies
// the forwarder is still healthy and restarts it if not. In dev-unrestricted
// mode, re-runs the teardown when resuming from sleep (where systemd may have
// re-enabled the unit on the next boot); otherwise no-op.
export async function ensureSandboxEgressOnExec(
  auth: Authenticator,
  sandbox: SandboxResource,
  { wokeFromSleep }: { wokeFromSleep: boolean }
): Promise<Result<void, Error>> {
  if (config.getSandboxDevUnrestrictedEgress()) {
    if (wokeFromSleep) {
      return teardownInSandboxEgressRedirect(auth, sandbox);
    }
    return new Ok(undefined);
  }

  if (wokeFromSleep) {
    logger.info(
      {
        event: "egress.restart_after_wake",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox woke from sleep, rewriting egress secrets and restarting forwarder"
    );
    return setupEgressForwarder(auth, sandbox, { restartExisting: true });
  }

  const healthResult = await checkEgressForwarderHealth(auth, sandbox);
  if (healthResult.isErr()) {
    return healthResult;
  }

  const logContext = {
    event: healthResult.value ? "egress.health_ok" : "egress.health_fail",
    providerId: sandbox.providerId,
    sandboxId: sandbox.sId,
  };

  if (healthResult.value) {
    logger.info(logContext, "Sandbox egress forwarder health check succeeded");
    return new Ok(undefined);
  }

  logger.warn(
    logContext,
    "Sandbox egress forwarder health check failed, restarting"
  );
  return setupEgressForwarder(auth, sandbox, { restartExisting: true });
}

// Dev-only: tear down the in-sandbox nftables redirect baked into the image
// (see egress-nftables.sh in the image registry) so agent-proxied traffic
// flows direct out of the (now permissive) E2B network, instead of being
// redirected to the local forwarder port that has no listener in this mode.
// Idempotent: safe to call on every fresh sandbox.
export async function teardownInSandboxEgressRedirect(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  if (!isDevelopment()) {
    return new Err(
      new Error(
        "teardownInSandboxEgressRedirect is dev-only and must not be called in production"
      )
    );
  }

  const command =
    "systemctl disable --now dust-egress-nftables.service >/dev/null 2>&1 || true; " +
    "nft delete table ip dust-egress >/dev/null 2>&1 || true; " +
    "nft delete table ip6 dust-egress >/dev/null 2>&1 || true";

  return runSuccessfulSandboxCommand(auth, sandbox, command, "root");
}

export async function setupEgressForwarder(
  auth: Authenticator,
  sandbox: SandboxResource,
  { restartExisting = false }: { restartExisting?: boolean } = {}
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
    return new Err(normalizeError(error));
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

  const prepareTokenResult = await runSuccessfulSandboxCommand(
    auth,
    sandbox,
    `chmod 600 ${shellEscape(EGRESS_TOKEN_PATH)}`,
    "root"
  );
  if (prepareTokenResult.isErr()) {
    return prepareTokenResult;
  }

  // Order matters: write the new token + secrets file BEFORE killing the old
  // dsbx. Both files are read at dsbx startup only, so the running process
  // doesn't notice the swap and clients keep getting served until the kill
  // lands. Reordering would create a window where dsbx restarts and reads
  // stale state.
  const secretsWriteResult = await writeEgressSecretsFile(auth, sandbox);
  if (secretsWriteResult.isErr()) {
    return secretsWriteResult;
  }

  if (restartExisting) {
    const killResult = await killEgressForwarder(auth, sandbox);
    if (killResult.isErr()) {
      return killResult;
    }
  }

  // PHASE0(remove with the experiment): env-var-driven gating of the MITM
  // stage. Both env vars must be set for the experiment to engage; setting
  // only the host without the token would turn on dsbx MITM and trust-bundle
  // injection while the smoke endpoint stays 404, which is a half-on state we
  // don't want. Phase 1 replaces this conditional with always-on MITM driven
  // by the configured set of secrets and their allowedDomains.
  const mitmHost = config.getEgressMitmExperimentHost();
  const mitmToken = config.getEgressMitmExperimentToken();
  const mitmExperimentHost = mitmHost && mitmToken ? mitmHost : null;
  const mitmFlags = mitmExperimentHost
    ? `--mitm-experiment-host ${shellEscape(mitmExperimentHost)} `
    : "";

  // Strip trust-bundle env vars from dsbx's own env. These are for agent
  // clients, not for dsbx validating the central proxy certificate.
  const startForwarderCommand =
    "nohup env " +
    "-u SSL_CERT_FILE -u SSL_CERT_DIR -u CURL_CA_BUNDLE " +
    "-u REQUESTS_CA_BUNDLE -u AWS_CA_BUNDLE -u GIT_SSL_CAINFO " +
    "-u NODE_EXTRA_CA_CERTS -u DENO_CERT -u DENO_TLS_CA_STORE " +
    "/opt/bin/dsbx forward " +
    `--token-file ${shellEscape(EGRESS_TOKEN_PATH)} ` +
    `--proxy-addr ${shellEscape(`${proxyAddr}:${config.getEgressProxyPort()}`)} ` +
    `--proxy-tls-name ${shellEscape(getProxyTlsName())} ` +
    `--listen ${shellEscape(EGRESS_FORWARDER_LISTEN_ADDR)} ` +
    `--deny-log ${shellEscape(EGRESS_DENY_LOG_PATH)} ` +
    mitmFlags +
    `>${shellEscape(EGRESS_FORWARDER_LOG_PATH)} 2>&1 &`;

  const startResult = await runSuccessfulSandboxCommand(
    auth,
    sandbox,
    startForwarderCommand,
    "root"
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

      const mitmTrustResult = await installMitmTrustBundle(auth, sandbox);
      if (mitmTrustResult.isErr()) {
        return mitmTrustResult;
      }

      return new Ok(undefined);
    }

    await sleep(EGRESS_SETUP_WAIT_MS);
  }

  return new Err(
    new Error("Sandbox egress forwarder did not become healthy in time")
  );
}

async function killEgressForwarder(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  return runSuccessfulSandboxCommand(
    auth,
    sandbox,
    `pkill -TERM dsbx >/dev/null 2>&1 || true; ` +
      `sleep ${DSBX_TERM_GRACE_SECONDS}; ` +
      `pkill -KILL dsbx >/dev/null 2>&1 || true`,
    "root"
  );
}

// Produces a merged bundle (system roots + dsbx persistent CA) so replace-style
// trust env vars can point at one file without breaking public HTTPS. The
// system-store install is best-effort so the agent still works on images
// without update-ca-certificates. Older already-running sandboxes may still
// have a dsbx that only writes the CA when the phase-0 experiment is enabled;
// missing CA is therefore a no-op for rollout compatibility.
async function installMitmTrustBundle(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const command =
    `[ -s ${shellEscape(MITM_CA_PATH)} ] || exit 0; ` +
    `mkdir -p ${shellEscape("/etc/dust")} ${shellEscape("/usr/local/share/ca-certificates")} && ` +
    `((cp ${shellEscape(MITM_CA_PATH)} ${shellEscape(MITM_SYSTEM_CA_DEST)} && update-ca-certificates >/dev/null 2>&1) || true) && ` +
    `_bundle_tmp=${shellEscape("/etc/dust/.ca-bundle.pem.tmp")} && ` +
    `cat ${shellEscape(MITM_SYSTEM_CA_BUNDLE)} ${shellEscape(MITM_CA_PATH)} > "$_bundle_tmp" && ` +
    `chmod 644 "$_bundle_tmp" && ` +
    `mv "$_bundle_tmp" ${shellEscape(MITM_CA_BUNDLE_PATH)}`;

  return runSuccessfulSandboxCommand(auth, sandbox, command, "root");
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
