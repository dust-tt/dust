import {
  createToolManifest,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
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

async function buildSandboxInstructions(
  auth: Authenticator,
  providerId?: ModelProviderIdType
): Promise<string> {
  let toolsResult;

  if (providerId) {
    toolsResult = getToolsForProvider(auth, providerId);
  } else {
    const imageResult = getSandboxImage(auth);
    if (imageResult.isErr()) {
      return SANDBOX_INSTRUCTIONS;
    }
    toolsResult = new Ok(imageResult.value.tools);
  }

  if (toolsResult.isErr()) {
    return SANDBOX_INSTRUCTIONS;
  }

  const manifest = createToolManifest(toolsResult.value);
  const manifestYaml = toolManifestToYAML(manifest);

  return `${SANDBOX_INSTRUCTIONS}

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
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
