import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import {
  generateExecId,
  generateSandboxExecToken,
  revokeExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import {
  checkEgressForwarderHealth,
  readNewDenyLogEntries,
  setupEgressForwarder,
} from "@app/lib/api/sandbox/egress";
import {
  addSandboxPolicyDomain,
  parseExactEgressDomain,
} from "@app/lib/api/sandbox/egress_policy";
import {
  mountConversationFiles,
  refreshGcsToken,
} from "@app/lib/api/sandbox/gcs/mount";
import {
  createToolManifest,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToJSON,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import { wrapCommand } from "@app/lib/api/sandbox/image/profile";
import { recordToolDuration } from "@app/lib/api/sandbox/instrumentation";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import logger from "@app/logger/logger";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { isDevelopment } from "@app/types/shared/env";
import { Err, Ok, type Result } from "@app/types/shared/result";

const DEFAULT_WORKING_DIRECTORY = "/home/agent";
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const ADD_EGRESS_DOMAIN_TOOL_NAME = "add_egress_domain" as const;
const REDACTION_MARKER_PREFIX = "«redacted:";
const REDACTION_MARKER_SUFFIX = "»";
const REDACTION_MIN_LENGTH = 16;
const REDACTION_MIN_ENTROPY_BITS_PER_CHAR = 3.5;

interface FormatExecOutputOpts {
  denyLogEntries?: string[];
}

function formatExecOutput(
  result: ExecResult,
  opts?: FormatExecOutputOpts
): string {
  const sections: string[] = [];

  if (result.stdout) {
    sections.push(`<stdout>\n${result.stdout}\n</stdout>`);
  }

  if (result.stderr) {
    sections.push(`<stderr>\n${result.stderr}\n</stderr>`);
  }

  if (result.exitCode !== 0) {
    sections.push(`<exit_code>${result.exitCode}</exit_code>`);
  }

  if (opts?.denyLogEntries && opts.denyLogEntries.length > 0) {
    sections.push(
      `<network_proxy_logs>\n${opts.denyLogEntries.join("\n")}\n</network_proxy_logs>`
    );
  }

  return sections.join("\n") || "(no output)";
}

// Shannon entropy in bits/char. Uniform random characters approach
// log2(alphabet size); dictionary words and uniform-digit strings sit well
// below.
function shannonEntropyBitsPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Skip values too short or too low-entropy to be worth redacting. The goal
// is to avoid mass-redacting common substrings (timestamps, short tokens,
// dictionary words) that randomly collide with unrelated bash output and
// turn legitimate text into «redacted: $FOO». False-negative tolerance is
// the trade-off; the skill instruction is the primary disclosure control.
function isRedactionEligible(value: string): boolean {
  return (
    value.length >= REDACTION_MIN_LENGTH &&
    shannonEntropyBitsPerChar(value) >= REDACTION_MIN_ENTROPY_BITS_PER_CHAR
  );
}

// Best-effort final-payload redaction for accidental bash output leaks.
// This does not catch transformed values, short/low-entropy values, other
// sandbox tools, or out-of-band exfiltration. The sandbox skill instruction
// remains the primary disclosure control.
async function redactSandboxEnvVarsFromOutput(
  auth: Authenticator,
  output: string
): Promise<Result<string, Error>> {
  const envResult = await WorkspaceSandboxEnvVarResource.loadEnv(auth);
  if (envResult.isErr()) {
    return envResult;
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  let redactedOutput = output;
  const redactedNames: string[] = [];

  // O(env_count × output_size): split/join scans the full output once per
  // eligible env var. Acceptable at current bounds (env_count ≤ 50 per
  // MAX_VARS_PER_WORKSPACE, output capped upstream).
  for (const [name, value] of Object.entries(envResult.value)) {
    if (!isRedactionEligible(value)) {
      continue;
    }

    if (redactedOutput.includes(value)) {
      redactedOutput = redactedOutput
        .split(value)
        .join(`${REDACTION_MARKER_PREFIX} $${name}${REDACTION_MARKER_SUFFIX}`);
      redactedNames.push(name);
    }
  }

  if (redactedNames.length > 0) {
    logger.warn(
      { workspaceId, varNames: redactedNames },
      "sandbox bash output contained env var values; redacted"
    );
  }

  return new Ok(redactedOutput);
}

function isSandboxAgentEgressRequestsAllowed(auth: Authenticator): boolean {
  return (
    auth.getNonNullableWorkspace().metadata?.sandboxAllowAgentEgressRequests ===
    true
  );
}

export async function createSandboxTools(
  auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): Promise<ToolDefinition[]> {
  const handlers: ToolHandlers<typeof SANDBOX_TOOLS_METADATA> = {
    bash: runSandboxBashTool,
    describe_toolset: async ({ format }, { auth, agentLoopContext }) => {
      const providerId =
        agentLoopContext?.runContext?.agentConfiguration.model.providerId;
      if (!providerId) {
        return new Err(new MCPError("Missing model provider ID"));
      }

      return buildDescribeToolsetOutput(auth, providerId, format ?? "yaml");
    },
    [ADD_EGRESS_DOMAIN_TOOL_NAME]: addEgressDomainTool,
  };

  const tools = buildTools(SANDBOX_TOOLS_METADATA, handlers);
  if (isSandboxAgentEgressRequestsAllowed(auth)) {
    return tools;
  }

  return tools.filter((tool) => tool.name !== ADD_EGRESS_DOMAIN_TOOL_NAME);
}

export async function buildDescribeToolsetOutput(
  auth: Authenticator,
  providerId: ModelProviderIdType,
  format: "json" | "yaml"
): Promise<Result<Array<{ type: "text"; text: string }>, MCPError>> {
  const flags = await getFeatureFlags(auth);
  const toolsResult = getToolsForProvider(auth, providerId, {
    includeDsbxTools: flags.includes("sandbox_dsbx_tools"),
  });
  if (toolsResult.isErr()) {
    return new Err(new MCPError(toolsResult.error.message));
  }
  const manifest = createToolManifest(toolsResult.value);
  const output =
    format === "json"
      ? toolManifestToJSON(manifest)
      : toolManifestToYAML(manifest);

  return new Ok([{ type: "text" as const, text: output }]);
}

export async function runSandboxBashTool(
  {
    command,
    workingDirectory,
    timeoutMs,
  }: {
    command: string;
    description: string;
    timeoutMs?: number;
    workingDirectory?: string;
  },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<Result<Array<{ type: "text"; text: string }>, MCPError>> {
  const conversation = agentLoopContext?.runContext?.conversation;
  const agentConfiguration = agentLoopContext?.runContext?.agentConfiguration;
  const agentMessage = agentLoopContext?.runContext?.agentMessage;
  if (!conversation || !agentConfiguration || !agentMessage) {
    return new Err(new MCPError("No conversation context available."));
  }

  const ensureResult = await SandboxResource.ensureActive(auth, conversation);
  if (ensureResult.isErr()) {
    return new Err(new MCPError(ensureResult.error.message));
  }

  const { sandbox, freshlyCreated, wokeFromSleep } = ensureResult.value;

  // Egress forwarder setup must run BEFORE GCS mounts. When the MITM
  // experiment is enabled, sandbox_resource.buildSandboxEnvVars exports
  // SSL_CERT_FILE / CURL_CA_BUNDLE pointing at /etc/dust/ca-bundle.pem, which
  // setupEgressForwarder is responsible for creating. Mounting (gcsfuse and
  // friends) makes HTTPS calls that read the trust bundle via those env vars,
  // so the bundle has to exist first.
  if (freshlyCreated) {
    const setupResult = await setupEgressForwarder(auth, sandbox);
    if (setupResult.isErr()) {
      return new Err(new MCPError(setupResult.error.message));
    }
  }

  const imageResult = getSandboxImage(auth);
  if (imageResult.isOk()) {
    const image = imageResult.value;

    void startTelemetry(auth, sandbox, conversation).catch((err) =>
      logger.error({ err }, "Telemetry start failed (fire-and-forget)")
    );

    if (freshlyCreated || wokeFromSleep) {
      const mountResult = await mountConversationFiles(
        auth,
        sandbox,
        conversation,
        image
      );
      if (mountResult.isErr()) {
        return new Err(new MCPError(mountResult.error.message));
      }
    } else {
      const refreshResult = await refreshGcsToken(
        auth,
        sandbox,
        conversation,
        image
      );
      if (refreshResult.isErr()) {
        return new Err(new MCPError(refreshResult.error.message));
      }
    }
  } else {
    logger.error(
      { err: imageResult.error },
      "Failed to get sandbox image for GCS mount"
    );
  }

  const healthResult = await checkEgressForwarderHealth(auth, sandbox);
  if (healthResult.isErr()) {
    return new Err(new MCPError(healthResult.error.message));
  }

  if (!healthResult.value) {
    logger.warn(
      {
        event: "egress.health_fail",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox egress forwarder health check failed, restarting"
    );
    const setupResult = await setupEgressForwarder(auth, sandbox);
    if (setupResult.isErr()) {
      return new Err(new MCPError(setupResult.error.message));
    }
  } else {
    logger.info(
      {
        event: "egress.health_ok",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox egress forwarder health check succeeded"
    );
  }

  const execId = generateExecId();
  const sandboxToken = await generateSandboxExecToken(auth, {
    agentConfiguration,
    agentMessage,
    conversation,
    sandbox,
    execId,
    expiryMs: DEFAULT_EXEC_TIMEOUT_MS,
  });

  const metricsCtx = { workspaceId: auth.getNonNullableWorkspace().sId };
  const startMs = performance.now();

  const providerId = agentConfiguration.model.providerId;
  const timeoutSec = timeoutMs ? Math.ceil(timeoutMs / 1000) : 60;
  const wrappedCommand = wrapCommand(command, providerId, {
    timeoutSec,
  });

  const sandboxAPIBase =
    isDevelopment() && config.getSandboxDevFrontHostName()
      ? `https://${config.getSandboxDevFrontHostName()}`
      : config.getClientFacingUrl();

  const execResult = await sandbox.exec(auth, wrappedCommand, {
    workingDirectory: workingDirectory ?? DEFAULT_WORKING_DIRECTORY,
    envVars: {
      DUST_SANDBOX_TOKEN: sandboxToken,
      DUST_API_URL: `${sandboxAPIBase}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
    },
    user: "agent-proxied",
  });

  const durationMs = performance.now() - startMs;
  recordToolDuration(
    "bash",
    durationMs,
    metricsCtx,
    execResult.isOk() ? "success" : "error"
  );

  void revokeExecToken({ sbId: sandbox.sId, execId }).catch((err) =>
    logger.error({ error: err }, "Failed to revoke exec token")
  );

  if (execResult.isErr()) {
    return new Err(new MCPError(execResult.error.message));
  }

  let denyLogEntries: string[] | undefined;
  const denyResult = await readNewDenyLogEntries(auth, sandbox);
  if (denyResult.isErr()) {
    logger.warn(
      { err: denyResult.error, providerId: sandbox.providerId },
      "Failed to read egress deny log"
    );
  } else if (denyResult.value.length > 0) {
    denyLogEntries = denyResult.value;
  }

  const output = formatExecOutput(execResult.value, { denyLogEntries });
  const redactedOutputResult = await redactSandboxEnvVarsFromOutput(
    auth,
    output
  );
  if (redactedOutputResult.isErr()) {
    logger.error(
      { err: redactedOutputResult.error },
      "Failed to load sandbox env vars for bash output redaction"
    );
    return new Err(new MCPError("Failed to safely return sandbox output."));
  }

  return new Ok([{ type: "text" as const, text: redactedOutputResult.value }]);
}

export async function addEgressDomainTool(
  { domain, reason }: { domain: string; reason: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<Result<Array<{ type: "text"; text: string }>, MCPError>> {
  if (!isSandboxAgentEgressRequestsAllowed(auth)) {
    return new Err(
      new MCPError(
        "Agent-driven egress requests are disabled for this workspace."
      )
    );
  }

  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(new MCPError("No conversation context available."));
  }

  const ensureResult = await SandboxResource.ensureActive(auth, conversation);
  if (ensureResult.isErr()) {
    return new Err(new MCPError(ensureResult.error.message));
  }
  const { sandbox } = ensureResult.value;

  const parsed = parseExactEgressDomain(domain);
  if (parsed.isErr()) {
    return new Err(new MCPError(parsed.error.message));
  }

  const result = await addSandboxPolicyDomain(auth, {
    sandboxProviderId: sandbox.providerId,
    domain: parsed.value,
  });
  if (result.isErr()) {
    return new Err(new MCPError(result.error.message));
  }

  void emitAuditLogEvent({
    auth,
    action: "sandbox_egress_policy.sandbox_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      {
        type: "sandbox_egress_policy",
        id: sandbox.providerId,
        name: `Sandbox egress policy ${sandbox.sId}`,
      },
    ],
    metadata: {
      sandbox_provider_id: sandbox.providerId,
      domain: parsed.value,
      added: String(result.value.addedDomain !== null),
      reason,
    },
  });

  const text =
    result.value.addedDomain !== null
      ? `Allowed: ${result.value.addedDomain}\n` +
        "The change is in effect for the current sandbox only and applies to " +
        "subsequent commands in this conversation."
      : `Already allowed: ${parsed.value}\n` +
        "No change made; this domain was already in the sandbox's allowlist.";

  return new Ok([{ type: "text" as const, text }]);
}
