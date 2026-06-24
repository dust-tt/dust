import { MCPError } from "@app/lib/actions/mcp_errors";
import type { BlockedAwaitingInputOutputResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isSandboxResumeState } from "@app/lib/actions/types";
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
import { readNewDenyLogEntries } from "@app/lib/api/sandbox/egress";
import {
  addSandboxPolicyDomain,
  parseExactEgressDomain,
} from "@app/lib/api/sandbox/egress_policy";
import {
  createToolManifest,
  getToolsForProvider,
  toolManifestToJSON,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import {
  buildWaitAndCollectCommand,
  wrapCommandWithCapture,
} from "@app/lib/api/sandbox/image/profile";
import { recordToolDuration } from "@app/lib/api/sandbox/instrumentation";
import { ensureSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import logger from "@app/logger/logger";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { isDevelopment } from "@app/types/shared/env";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

const DEFAULT_WORKING_DIRECTORY = "/home/agent";
const DEFAULT_EXEC_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h
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

// The egress proxy's domain-allowlist gate writes this reason. It is the only
// deny reason that means "this domain was blocked" and is actionable by the
// agent (ask an admin / add_egress_domain).
const PROXY_ALLOWLIST_DENY_REASON = "proxy_denied";

const DenyLogLineSchema = z.object({
  reason: z.string(),
  domain: z.string().nullish(),
  port: z.number().nullish(),
});

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// The sandbox deny log is written by two distinct layers into one file: the
// egress proxy's domain-allowlist gate (`proxy_denied`) and the in-sandbox
// request-rewrite harness (malformed headers, secret-to-host scoping, SNI
// checks, ...). Only the allowlist denials mean "this domain was blocked".
// Surfacing the harness reasons under the same `<network_proxy_logs>` block
// makes agents misread auth/4xx failures on *allowed* domains as proxy blocks,
// so we keep only allowlist denials for the agent and present them as a clean,
// unambiguous line. Unrecognized lines are kept verbatim (fail open) so we
// never silently swallow a real denial we don't understand.
function filterAgentFacingDenyLogEntries(rawLines: string[]): string[] {
  return rawLines.flatMap((line) => {
    const parsed = DenyLogLineSchema.safeParse(safeJsonParse(line));
    if (!parsed.success) {
      return [line];
    }
    if (parsed.data.reason !== PROXY_ALLOWLIST_DENY_REASON) {
      return [];
    }
    const { domain, port } = parsed.data;
    if (!domain) {
      return [line];
    }
    return [
      `denied ${domain}${port ? `:${port}` : ""} (blocked by egress allowlist)`,
    ];
  });
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
  // loadEnv is intentionally config-only. HTTPS secrets are injected as DSEC
  // placeholders and their real values should never be materialized here.
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

  // The add_egress_domain tool requires both the workspace admin flag
  // (gates the whole agent-egress-requests configuration) and the
  // per-workspace setting that admins toggle on top of it.
  const flags = await getFeatureFlags(auth);
  if (
    isComputerFeatureEnabled(flags, "sandbox_workspace_admin") &&
    isSandboxAgentEgressRequestsAllowed(auth)
  ) {
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
    includeDsbxTools: isComputerFeatureEnabled(flags, "sandbox_dsbx_tools"),
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
): Promise<
  Result<
    Array<
      | { type: "text"; text: string }
      | {
          type: "resource";
          resource: BlockedAwaitingInputOutputResourceType;
        }
    >,
    MCPError
  >
> {
  const runContext = agentLoopContext?.runContext;
  if (!runContext) {
    return new Err(new MCPError("No conversation context available."));
  }
  const {
    conversation,
    agentConfiguration,
    agentMessage,
    currentAction: sandboxAction,
    stepContext,
  } = runContext;

  // Resume mode is entered when the parent bash action's step context carries
  // an execId from a prior pause cycle. The original `sandbox.exec()` is
  // either still running inside the (now-thawed) sandbox or has already
  // finished and written the exit sentinel; we tail its output via
  // `wait-and-collect` instead of re-running the command.
  const resumeExecId = isSandboxResumeState(stepContext.resumeState)
    ? stepContext.resumeState.execId
    : null;
  const isResumeMode = resumeExecId !== null;

  const ensureResult = await ensureSandboxReady(auth, conversation);
  if (ensureResult.isErr()) {
    return new Err(new MCPError(ensureResult.error.message));
  }

  const { sandbox, freshlyCreated } = ensureResult.value;

  // If we entered resume mode but the sandbox had to be created from scratch
  // (the reaper transitioned the paused sandbox to sleeping and then deleted
  // it, or the provider GC'd it), the original exec's tee output file is
  // gone — `wait-and-collect` would loop forever. Fail clean so the agent
  // can decide whether to retry.
  if (isResumeMode && freshlyCreated) {
    logger.error(
      {
        execId: resumeExecId,
        conversationId: conversation.sId,
        sandboxId: sandbox.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Sandbox bash resume failed: original sandbox was lost during approval wait"
    );
    return new Err(
      new MCPError(
        "Sandbox was lost during approval wait; original execution is unrecoverable."
      )
    );
  }

  const execId = resumeExecId ?? generateExecId();
  const sandboxToken = await generateSandboxExecToken(auth, {
    agentConfiguration,
    agentMessage,
    conversation,
    sandbox,
    execId,
    // Token must outlive the longest plausible pause/resume cycle. Redis
    // revocation list bounds the real lifetime.
    expiryMs: DEFAULT_EXEC_TIMEOUT_MS,
    sandboxAction,
  });

  const metricsCtx = { workspaceId: auth.getNonNullableWorkspace().sId };
  const startMs = performance.now();

  const providerId = agentConfiguration.model.providerId;
  const timeoutSec = timeoutMs ? Math.ceil(timeoutMs / 1000) : 60;
  const commandToRun = isResumeMode
    ? buildWaitAndCollectCommand(execId)
    : wrapCommandWithCapture(command, execId, providerId, { timeoutSec });

  const sandboxAPIBase =
    isDevelopment() && config.getSandboxDevFrontHostName()
      ? `https://${config.getSandboxDevFrontHostName()}`
      : config.getApiBaseUrl();

  const execResult = await sandbox.exec(auth, commandToRun, {
    workingDirectory: workingDirectory ?? DEFAULT_WORKING_DIRECTORY,
    envVars: {
      DUST_SANDBOX_TOKEN: sandboxToken,
      DUST_API_URL: `${sandboxAPIBase}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
    },
    user: "agent-proxied",
  });

  // Server-driven pause: a blocked sandbox-child action triggers
  // `pauseSandboxBashForBlockedChild`, which atomically flips this bash
  // action's status from `running` → `blocked_child_action_input_required`
  // and calls `betaPause`. We observe the result here by refetching the
  // parent action. The execId is persisted by the generic
  // `tool_blocked_awaiting_input` exit_events path, which reads `state`
  // off the resource we return below.
  const freshParent = await AgentMCPActionResource.fetchById(
    auth,
    sandboxAction.sId
  );
  const wasPaused =
    freshParent !== null && isToolExecutionStatusBlocked(freshParent.status);

  if (!wasPaused) {
    const durationMs = performance.now() - startMs;
    recordToolDuration(
      "bash",
      durationMs,
      metricsCtx,
      execResult.isOk() ? "success" : "error"
    );
  }

  if (wasPaused) {
    logger.info(
      {
        execId,
        conversationId: conversation.sId,
        sandboxId: sandbox.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Sandbox bash paused waiting for tool approval"
    );

    return new Ok([
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_blocked_awaiting_input" as const,
          text: "Sandbox bash paused waiting for tool approval",
          uri: "",
          blockingEvents: [],
          state: { execId },
        },
      },
    ]);
  }

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
    const filtered = filterAgentFacingDenyLogEntries(denyResult.value);
    if (filtered.length > 0) {
      denyLogEntries = filtered;
    }
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
  // Defense-in-depth: createSandboxTools already filters this tool out when the
  // sandbox_workspace_admin flag is off, so this metadata-only check is enough
  // to reject any caller that bypasses tool-list filtering.
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

  const ensureResult = await ensureSandboxReady(auth, conversation);
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
