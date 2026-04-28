import { readWorkspacePolicy } from "@app/lib/api/sandbox/egress_policy";
import {
  createToolManifest,
  filterDsbxToolEntries,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Ok } from "@app/types/shared/result";

function buildSandboxInstructionProse({
  hasDsbxTools,
}: {
  hasDsbxTools: boolean;
}): string {
  const instructions = [
    "The sandbox provides an isolated Linux environment for running code, scripts, and shell commands.",
    "Use `bash` to run commands and scripts.",
    "The sandbox persists for the conversation duration.",
    "Conversation files are mounted at /files/conversation.",
    "This includes files uploaded by the user and files created by the agent.",
  ];

  if (hasDsbxTools) {
    instructions.push(
      "You can use the `dsbx` command line tool to list and run tools programmatically in the sandbox.",
      "Use it with `dsbx tools [SERVER_NAME] [TOOL_NAME] [ARGS]...`. Run `dsbx tools --help` for more information.",
    );
  }

  instructions.push(
    "Write output files (scripts, results, exports) to /files/conversation to make them available to the user.",
  );

  return instructions.join(" ");
}

function formatWorkspaceAllowlist(domains: string[]): string {
  if (domains.length === 0) {
    return "_(none — this workspace has no preapproved domains)_";
  }
  return domains.map((d) => `- \`${d}\``).join("\n");
}

async function fetchSandboxAllowAgentEgressRequests(
  auth: Authenticator,
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  const result = await WorkspaceResource.fetchSandboxAllowAgentEgressRequests(
    workspace.sId,
  );
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "Failed to read sandbox agent egress request setting for skill instructions",
    );
    return false;
  }

  return result.value;
}

async function buildNetworkAccessSection(auth: Authenticator): Promise<string> {
  const allowAgentRequests = await fetchSandboxAllowAgentEgressRequests(auth);
  const policyResult = await readWorkspacePolicy(auth);
  let workspaceDomains: string[] = [];
  if (policyResult.isErr()) {
    logger.warn(
      { err: policyResult.error },
      "Failed to read workspace egress policy for sandbox skill instructions",
    );
  } else {
    workspaceDomains = policyResult.value.allowedDomains;
  }

  if (!allowAgentRequests) {
    return `#### Sandbox Network Access

All outbound network traffic from the sandbox is routed through an egress
proxy that **denies every request by default**. Only domains on the
workspace allowlist below should be relied on. There is **no** way to add
additional domains during the conversation. If a required domain is not
listed, use only preapproved domains or local data, or explain the blocker and
ask the user to contact their workspace admin.

Workspace allowlist:

${formatWorkspaceAllowlist(workspaceDomains)}

If a request is blocked, the bash tool output will include a
\`<network_proxy_logs>\` block listing the denied domain(s). Surface that
information to the user so they can decide whether to ask their admin to
allowlist it; do not retry without changes.`;
  }

  return `#### Sandbox Network Access

All outbound network traffic from the sandbox is routed through an egress
proxy that **denies every request by default**. Only domains on the
sandbox's allowlist can be reached.

The allowlist is the union of two sources:

1. **Workspace allowlist** — domains preapproved by the workspace admin
   for every sandbox in this workspace:

${formatWorkspaceAllowlist(workspaceDomains)}

2. **Sandbox allowlist** — domains added during this conversation via the
   \`add_egress_domain\` tool. These live for the lifetime of the current
   sandbox only and are discarded when the sandbox is reaped.

When you plan to hit a domain that is not on the workspace allowlist, you
should call \`add_egress_domain\` **before** running the command, with the
**exact** domain (wildcards are not accepted) and a one-sentence reason
the user will see in the approval prompt. This is preferable to running
the command first and reacting to a denial.

If a request does get blocked — for example because you missed a domain or
a redirect chain hits an unexpected host — the bash tool output will
include a \`<network_proxy_logs>\` block listing the denied domain(s).
Use that block to identify the missing domain and call
\`add_egress_domain\` to unblock the next attempt. If a request mysteriously
hangs or fails with TLS/DNS errors, check the \`<network_proxy_logs>\`
block first; a denied egress is a possible cause.`;
}

async function buildSandboxInstructions(
  auth: Authenticator,
  providerId: ModelProviderIdType | undefined,
  hasDsbxTools: boolean,
): Promise<string> {
  const networkAccessSection = await buildNetworkAccessSection(auth);
  const sandboxInstructions = buildSandboxInstructionProse({ hasDsbxTools });

  let toolsResult;

  if (providerId) {
    toolsResult = getToolsForProvider(auth, providerId, {
      includeDsbxTools: hasDsbxTools,
    });
  } else {
    const imageResult = getSandboxImage(auth);
    if (imageResult.isErr()) {
      return `${sandboxInstructions}\n\n${networkAccessSection}`;
    }
    toolsResult = new Ok(
      filterDsbxToolEntries(imageResult.value.tools, {
        includeDsbxTools: hasDsbxTools,
      }),
    );
  }

  if (toolsResult.isErr()) {
    return `${sandboxInstructions}\n\n${networkAccessSection}`;
  }

  const manifest = createToolManifest(toolsResult.value);
  const manifestYaml = toolManifestToYAML(manifest);

  return `${sandboxInstructions}

${networkAccessSection}

#### Sandbox Available Tools and Libraries

The following tools and libraries are pre-installed in the sandbox environment.
Installing packages in the sandbox is NOT possible.
CRITICAL: Use ONLY the sandbox tools listed below, NOTHING ELSE.

\`\`\`yaml
${manifestYaml}
\`\`\`

`;
}

export const sandboxSkill = {
  sId: "sandbox",
  name: "Sandbox",
  userFacingDescription:
    "Run code, scripts, and shell commands in an isolated Linux environment.",
  agentFacingDescription:
    "Execute code and commands in an isolated Linux sandbox. Useful to parse lengthy tool outputs, run code, " +
    "process data, install packages, manipulate files, or perform any task requiring shell access.",
  fetchInstructions: async (
    auth: Authenticator,
    {
      agentLoopData,
    }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData },
  ) => {
    const providerId = agentLoopData?.agentConfiguration?.model.providerId;
    const flags = await getFeatureFlags(auth);
    const hasDsbxTools = flags.includes("sandbox_dsbx_tools");

    return buildSandboxInstructions(auth, providerId, hasDsbxTools);
  },
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "CommandLineIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("sandbox_tools");
  },
} as const satisfies SystemSkillDefinition;
