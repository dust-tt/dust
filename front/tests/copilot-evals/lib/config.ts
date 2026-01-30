import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_COPILOT_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";
import { AGENT_COPILOT_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { _getCopilotGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/copilot";
import { Authenticator } from "@app/lib/auth";
import type { CopilotConfig } from "@app/tests/copilot-evals/lib/types";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

export const RUN_COPILOT_EVAL = process.env.RUN_COPILOT_EVAL === "true";
export const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
export const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
export const FILTER_CATEGORY = process.env.FILTER_CATEGORY;
export const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
export const COPILOT_ON_COPILOT = process.env.COPILOT_ON_COPILOT === "true";

export const TIMEOUT_MS = 300_000;
export const COPILOT_ON_COPILOT_TIMEOUT_MS = 600_000;
export const MAX_TOOL_CALL_ROUNDS = 5;

export const ONE_HOUR_MS = 3_600_000;
export const ONE_DAY_MS = 86_400_000;

const COPILOT_MCP_SERVERS = [
  AGENT_COPILOT_AGENT_STATE_SERVER,
  AGENT_COPILOT_CONTEXT_SERVER,
] as const;

export async function getCopilotConfig(): Promise<CopilotConfig> {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const copilotConfig = _getCopilotGlobalAgent(auth, {
    copilotMCPServerViews: null,
    copilotUserMetadata: null,
  });

  const tools: AgentActionSpecification[] = [];

  for (const server of COPILOT_MCP_SERVERS) {
    for (const tool of server.tools) {
      if (tool.inputSchema) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
  }

  return {
    instructions: copilotConfig.instructions ?? "",
    model: copilotConfig.model,
    tools,
  };
}

export function createMockAuthenticator(): Authenticator {
  return new Authenticator({
    workspace: null,
    user: null,
    role: "none",
    groupModelIds: [],
    subscription: null,
    authMethod: "internal",
  });
}
