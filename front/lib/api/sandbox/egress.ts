import { lookup } from "node:dns/promises";
import config from "@app/lib/api/config";
import { config as regionConfig } from "@app/lib/api/regions/config";
import {
  EGRESS_SECRETS_PATH,
  writeEgressSecretsFile,
} from "@app/lib/api/sandbox/egress_secrets";
import { SANDBOX_AGENT_PROXIED_UID } from "@app/lib/api/sandbox/image/types";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SANDBOX_TRUST_ENV_VARS } from "@app/lib/api/sandbox/trust_env";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const EGRESS_FORWARDER_LISTEN_ADDR = "127.0.0.1:9990";
const EGRESS_RESOLVER_LISTEN_ADDR = "127.0.0.1:1053";
const EGRESS_PROXIED_UID = SANDBOX_AGENT_PROXIED_UID;
const EGRESS_TOKEN_PATH = "/etc/dust/egress-token";
const EGRESS_DENY_LOG_PATH = "/tmp/dust-egress-denied.log";
const EGRESS_DENY_LOG_OFFSET_PATH = "/tmp/.dust-egress-deny-offset";
const EGRESS_FORWARDER_LOG_PATH = "/tmp/dust-forwarder.log";
const EGRESS_SETUP_WAIT_RETRIES = 6;
const EGRESS_SETUP_WAIT_MS = 500;
const EGRESS_JWT_TTL_SECONDS = 24 * 60 * 60;
const MAX_DENY_LOG_LINES_PER_EXEC = 20;

// dsbx owns /run/dust/egress-ca.pem and reuses the file across restarts when
// it's present; load_or_generate handles a missing file by minting a new CA.
const MITM_CA_PATH = "/run/dust/egress-ca.pem";
const MITM_CA_BUNDLE_PATH = "/etc/dust/ca-bundle.pem";
const MITM_TRUST_BUNDLE_INSTALLER_PATH =
  "/usr/local/bin/dust-install-trust-bundle";
// Constants used by the pre-0.8.8 fallback path. Remove with the fallback
// once all dust-base:0.8.7 sandboxes have aged out.
const MITM_SYSTEM_CA_DEST = "/usr/local/share/ca-certificates/dust-egress.crt";
const MITM_SYSTEM_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt";
// Sentinel written atomically alongside the merged bundle so the health probe
// can distinguish "installMitmTrustBundle ran successfully" from "image-seeded
// system-only placeholder". Without it, [ -s ca-bundle.pem ] is true the
// moment the sandbox boots and the bundle self-heal never fires.
const MITM_CA_BUNDLE_MARKER_PATH = "/etc/dust/.ca-bundle.merged";

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

type EgressHealthState = {
  portOk: boolean;
  resolverOk: boolean;
  nftablesOk: boolean;
  bundleOk: boolean;
};

const EgressHealthcheckOutputSchema = z.object({
  forwarder_port_ok: z.boolean(),
  resolver_udp_ok: z.boolean(),
  resolver_tcp_ok: z.boolean(),
  nft_dns_udp_redirect_ok: z.boolean(),
  nft_dns_tcp_redirect_ok: z.boolean(),
  nft_dns_udp_accept_ok: z.boolean(),
  nft_tcp_forward_redirect_ok: z.boolean(),
  nft_udp_drop_ok: z.boolean(),
  nft_icmp_drop_ok: z.boolean(),
  nft_ipv6_drop_ok: z.boolean(),
  bundle_ok: z.boolean(),
});

const FAILED_EGRESS_HEALTH_STATE: EgressHealthState = {
  portOk: false,
  resolverOk: false,
  nftablesOk: false,
  bundleOk: false,
};

function parseEgressHealthcheckOutput(
  stdout: string,
  logContext: Record<string, unknown>
): EgressHealthState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    logger.warn(
      { ...logContext, error: normalizeError(error).message, stdout },
      "Sandbox egress healthcheck stdout was not valid JSON"
    );
    return FAILED_EGRESS_HEALTH_STATE;
  }

  const validation = EgressHealthcheckOutputSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn(
      { ...logContext, error: fromError(validation.error).toString(), stdout },
      "Sandbox egress healthcheck output did not match expected schema"
    );
    return FAILED_EGRESS_HEALTH_STATE;
  }

  const data = validation.data;
  // nftablesOk mirrors the full enforcement boundary, not just the DNS rules:
  // DNS interception alone isn't load-bearing without the generic UDP/ICMP/
  // IPv6 drops and the broad TCP redirect to the forwarder. Treating a
  // partially damaged table as healthy would silently reopen non-53 UDP.
  const nftablesOk =
    data.nft_dns_udp_redirect_ok &&
    data.nft_dns_tcp_redirect_ok &&
    data.nft_dns_udp_accept_ok &&
    data.nft_tcp_forward_redirect_ok &&
    data.nft_udp_drop_ok &&
    data.nft_icmp_drop_ok &&
    data.nft_ipv6_drop_ok;
  if (!nftablesOk) {
    logger.warn(
      { ...logContext, signals: data },
      "Sandbox egress healthcheck aggregate failed; per-signal breakdown"
    );
  }
  return {
    portOk: data.forwarder_port_ok,
    resolverOk: data.resolver_udp_ok && data.resolver_tcp_ok,
    nftablesOk,
    bundleOk: data.bundle_ok,
  };
}

export async function checkEgressForwarderHealth(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<EgressHealthState, Error>> {
  // dsbx healthcheck reads kernel state directly (proc/net + nft list) so we
  // avoid the noisy <unknown> deny log entry that a real connect-through-the-
  // forwarder probe would generate. The bundle signal looks for the merge
  // sentinel, not just the bundle file: the image seeds a system-only
  // ca-bundle.pem so a bare `[ -s ]` would be true before installMitmTrustBundle
  // ever ran. Signals are reported separately so callers can remediate the
  // forwarder and bundle independently while failing closed on missing DNS
  // enforcement.
  const logContext = {
    event: "egress.healthcheck_parse",
    providerId: sandbox.providerId,
    sandboxId: sandbox.sId,
  };

  // Root is required: `nft list table` needs CAP_NET_ADMIN, and the probe also
  // reads /proc/net/{tcp,udp} which is fine non-root but pointless to split.
  const result = await sandbox.exec(
    auth,
    `/opt/bin/dsbx healthcheck ` +
      `--forwarder-listen ${shellEscape(EGRESS_FORWARDER_LISTEN_ADDR)} ` +
      `--resolver-listen ${shellEscape(EGRESS_RESOLVER_LISTEN_ADDR)} ` +
      `--proxied-uid ${EGRESS_PROXIED_UID} ` +
      `--ca-bundle ${shellEscape(MITM_CA_BUNDLE_PATH)} ` +
      `--ca-bundle-marker ${shellEscape(MITM_CA_BUNDLE_MARKER_PATH)}`,
    { user: "root", timeoutMs: 1_000 }
  );

  if (result.isErr()) {
    return result;
  }

  if (result.value.exitCode !== 0) {
    logger.warn(
      {
        ...logContext,
        exitCode: result.value.exitCode,
        stderr: result.value.stderr,
      },
      "Sandbox egress healthcheck exited non-zero (treating as fully unhealthy)"
    );
    return new Ok(FAILED_EGRESS_HEALTH_STATE);
  }

  const state = parseEgressHealthcheckOutput(
    result.value.stdout.trim(),
    logContext
  );

  // dsbx healthcheck exits 0 with `nft_*_ok: false` when it could read JSON
  // but the underlying probe (missing nft binary, EPERM, non-UTF8 output)
  // logged a diagnostic to stderr. Surface that stderr here so the reason
  // is not lost just because the JSON parse succeeded.
  const trimmedStderr = result.value.stderr.trim();
  const anyUnhealthy =
    !state.portOk || !state.resolverOk || !state.nftablesOk || !state.bundleOk;
  if (anyUnhealthy && trimmedStderr.length > 0) {
    logger.warn(
      { ...logContext, stderr: trimmedStderr, state },
      "Sandbox egress healthcheck exited zero but reported unhealthy with diagnostic stderr"
    );
  }

  return new Ok(state);
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
      "Sandbox woke from sleep, re-running full egress setup"
    );
    return setupEgressForwarder(auth, sandbox, { restartExisting: true });
  }

  const healthResult = await checkEgressForwarderHealth(auth, sandbox);
  if (healthResult.isErr()) {
    return healthResult;
  }

  const { portOk, resolverOk, nftablesOk, bundleOk } = healthResult.value;
  const baseLogContext = {
    providerId: sandbox.providerId,
    sandboxId: sandbox.sId,
  };

  if (!portOk) {
    logger.warn(
      { ...baseLogContext, event: "egress.health_fail" },
      "Sandbox egress forwarder port not listening, restarting"
    );
    return setupEgressForwarder(auth, sandbox, { restartExisting: true });
  }

  if (!resolverOk || !nftablesOk) {
    logger.warn(
      {
        ...baseLogContext,
        event: "egress.enforcement_health_fail",
        resolverOk,
        nftablesOk,
      },
      "Sandbox egress DNS enforcement health check failed"
    );
    return new Err(
      new Error("Sandbox egress DNS enforcement health check failed")
    );
  }

  if (!bundleOk) {
    // dsbx is fine but the trust bundle was never installed (or was lost).
    // Reinstall idempotently without disrupting the running forwarder.
    logger.warn(
      { ...baseLogContext, event: "egress.bundle_missing" },
      "Sandbox egress trust bundle missing, reinstalling"
    );
    return installMitmTrustBundle(auth, sandbox);
  }

  logger.info(
    { ...baseLogContext, event: "egress.health_ok" },
    "Sandbox egress health check succeeded"
  );
  return new Ok(undefined);
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
    "systemctl disable --now dust-egress-resolver.service dust-egress-nftables.service >/dev/null 2>&1 || true; " +
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

  // Write the secrets file before killing the old dsbx so a write failure
  // leaves the existing forwarder running instead of taking it down with
  // nothing to replace it.
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

  // Strip every trust-bundle env var we set on the sandbox process from
  // dsbx's own environment. dsbx talks to the central proxy with a vendored
  // TLS root and must NOT be reconfigured to trust the merged ca-bundle.pem
  // (which contains its own CA, opening a forge-and-tunnel loop). The strip
  // list is derived from SANDBOX_TRUST_ENV_VARS so adding a new trust env
  // var can't drift the two sites out of sync.
  const trustEnvStripFlags = Object.keys(SANDBOX_TRUST_ENV_VARS)
    .map((k) => `-u ${k}`)
    .join(" ");
  const startForwarderCommand =
    `nohup env ${trustEnvStripFlags} ` +
    "/opt/bin/dsbx forward " +
    `--token-file ${shellEscape(EGRESS_TOKEN_PATH)} ` +
    `--proxy-addr ${shellEscape(`${proxyAddr}:${config.getEgressProxyPort()}`)} ` +
    `--proxy-tls-name ${shellEscape(getProxyTlsName())} ` +
    `--listen ${shellEscape(EGRESS_FORWARDER_LISTEN_ADDR)} ` +
    `--deny-log ${shellEscape(EGRESS_DENY_LOG_PATH)} ` +
    `--secrets-file ${shellEscape(EGRESS_SECRETS_PATH)} ` +
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
    // Setup waits on the forwarder and DNS enforcement. The bundle gets
    // installed below and is checked on subsequent execs.
    if (
      healthResult.value.portOk &&
      healthResult.value.resolverOk &&
      healthResult.value.nftablesOk
    ) {
      logger.info(logContext, "Sandbox egress is healthy");
      return installMitmTrustBundle(auth, sandbox);
    }

    await sleep(EGRESS_SETUP_WAIT_MS);
  }

  return new Err(new Error("Sandbox egress did not become healthy in time"));
}

async function killEgressForwarder(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  // Restarts only happen when no client is using dsbx (after wake, before the
  // agent loop runs; or after a failed health check, when the listener isn't
  // serving anyway). SIGKILL is fine, no graceful shutdown needed.
  //
  // The regex is anchored to `/opt/bin/dsbx forward` to avoid killing the
  // co-resident `dsbx resolve` subcommand that runs the DNS stub.
  return runSuccessfulSandboxCommand(
    auth,
    sandbox,
    "pkill -KILL -f '^/opt/bin/dsbx forward( |$)' >/dev/null 2>&1 || true",
    "root"
  );
}

// Produces a merged bundle (system roots + dsbx persistent CA) and installs
// runtime-specific trust hooks such as the Java keystore import. Callers must
// only invoke this once dsbx is up; if the CA file is missing we fail rather
// than silently leaving the sandbox with system-roots-only trust. The marker
// file is written last so the bundle and its "merged" status flip atomically
// from the health-probe's point of view. The marker write lives here (outside
// the helper script) so a failed marker write does not strand the sandbox: the
// merged bundle is on disk but the sentinel is missing, and the split-health
// probe's bundle/sentinel branch retries the install idempotently.
async function installMitmTrustBundle(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  // Pre-0.8.8 sandboxes don't have the helper script. We can't ship a new
  // image to already-running sandboxes, so fall back to the inline install
  // command from before slice 4.7 (system store update + merged bundle
  // rebuild) when the helper is missing. Keytool / Java is skipped in the
  // fallback (no JDK in 0.8.7 either, dead branch).
  // TODO(2026-08-01 SANDBOX): remove the fallback once all pre-0.8.8
  // sandboxes have aged out.
  const inlineFallback =
    `mkdir -p ${shellEscape("/etc/dust")} ${shellEscape("/usr/local/share/ca-certificates")} && ` +
    `((cp ${shellEscape(MITM_CA_PATH)} ${shellEscape(MITM_SYSTEM_CA_DEST)} && update-ca-certificates >/dev/null 2>&1) || true) && ` +
    `_bundle_tmp=$(mktemp ${shellEscape("/etc/dust/.ca-bundle.pem.XXXXXX")}) && ` +
    `{ cat ${shellEscape(MITM_SYSTEM_CA_BUNDLE)}; printf '\\n'; cat ${shellEscape(MITM_CA_PATH)}; } > "$_bundle_tmp" && ` +
    `chmod 644 "$_bundle_tmp" && ` +
    `mv "$_bundle_tmp" ${shellEscape(MITM_CA_BUNDLE_PATH)}`;

  const command =
    `[ -s ${shellEscape(MITM_CA_PATH)} ] || ` +
    `{ echo "dsbx CA file ${MITM_CA_PATH} missing or empty" >&2; exit 1; }; ` +
    `if [ -x ${shellEscape(MITM_TRUST_BUNDLE_INSTALLER_PATH)} ]; then ` +
    `${shellEscape(MITM_TRUST_BUNDLE_INSTALLER_PATH)}; ` +
    `else ` +
    `${inlineFallback}; ` +
    `fi && ` +
    `: > ${shellEscape(MITM_CA_BUNDLE_MARKER_PATH)}`;

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
    `_state=$(cat ${shellEscape(EGRESS_DENY_LOG_OFFSET_PATH)} 2>/dev/null || true); ` +
    `set -- $_state; ` +
    `_off=\${1:-0}; _size_off=\${2:-0}; ` +
    `case "$_off" in ''|*[!0-9]*) _off=0;; esac; ` +
    `case "$_size_off" in ''|*[!0-9]*) _size_off=0;; esac; ` +
    `if [ -f ${shellEscape(EGRESS_DENY_LOG_PATH)} ]; then ` +
    `_total=$(wc -l < ${shellEscape(EGRESS_DENY_LOG_PATH)} | tr -d ' '); ` +
    `_size=$(wc -c < ${shellEscape(EGRESS_DENY_LOG_PATH)} | tr -d ' '); ` +
    `else _total=0; _size=0; fi; ` +
    `if [ "$_total" -lt "$_off" ] || [ "$_size" -lt "$_size_off" ]; then _off=0; fi; ` +
    `if [ "$_total" -gt "$_off" ]; then ` +
    `tail -n +$((_off + 1)) ${shellEscape(EGRESS_DENY_LOG_PATH)} | head -n ${MAX_DENY_LOG_LINES_PER_EXEC}; ` +
    `fi; ` +
    `echo "$_total $_size" > ${shellEscape(EGRESS_DENY_LOG_OFFSET_PATH)}`;

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
