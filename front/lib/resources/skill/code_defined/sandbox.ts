import { readWorkspacePolicy } from "@app/lib/api/sandbox/egress_policy";
import {
  createToolManifest,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Ok } from "@app/types/shared/result";

const SANDBOX_INSTRUCTIONS =
  "The sandbox provides an isolated Linux environment for running code, scripts, and shell commands. " +
  "Use `bash` to run commands and scripts. " +
  "The sandbox persists for the conversation duration. " +
  "Conversation files are mounted at /files/conversation. " +
  "/files/conversation may be empty, there is a sentinel dotfile /files/conversation/.mount-pending in that case, it is fine to wait 1 second and retry your command should you find the dotfile. " +
  "This includes files uploaded by the user and files created by the agent. " +
  "You can use the `dsbx` command line tool to list and run tools programmatically in the sandbox. " +
  "Use it with `dsbx tools [SERVER_NAME] [TOOL_NAME] [ARGS]...`. Run `dsbx tools --help` for more information. " +
  "Write output files (scripts, results, exports) to /files/conversation to make them available to the user.";

function formatWorkspaceAllowlist(domains: string[]): string {
  if (domains.length === 0) {
    return "_(none — this workspace has no preapproved domains)_";
  }
  return domains.map((d) => `- \`${d}\``).join("\n");
}

async function buildNetworkAccessSection(auth: Authenticator): Promise<string> {
  const policyResult = await readWorkspacePolicy(auth);
  let workspaceDomains: string[] = [];
  if (policyResult.isErr()) {
    logger.warn(
      { err: policyResult.error },
      "Failed to read workspace egress policy for sandbox skill instructions"
    );
  } else {
    workspaceDomains = policyResult.value.allowedDomains;
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
block first; a denied egress is the most likely cause.`;
}

async function buildSandboxInstructions(
  auth: Authenticator,
  providerId?: ModelProviderIdType
): Promise<string> {
  const networkAccessSection = await buildNetworkAccessSection(auth);

  let toolsResult;

  if (providerId) {
    toolsResult = getToolsForProvider(auth, providerId);
  } else {
    const imageResult = getSandboxImage(auth);
    if (imageResult.isErr()) {
      return `${SANDBOX_INSTRUCTIONS}\n\n${networkAccessSection}`;
    }
    toolsResult = new Ok(imageResult.value.tools);
  }

  if (toolsResult.isErr()) {
    return `${SANDBOX_INSTRUCTIONS}\n\n${networkAccessSection}`;
  }

  const manifest = createToolManifest(toolsResult.value);
  const manifestYaml = toolManifestToYAML(manifest);

  return `${SANDBOX_INSTRUCTIONS}

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
    }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const providerId = agentLoopData?.agentConfiguration?.model.providerId;
    return buildSandboxInstructions(auth, providerId);
  },
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "CommandLineIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("sandbox_tools");
  },
} as const satisfies SystemSkillDefinition;
