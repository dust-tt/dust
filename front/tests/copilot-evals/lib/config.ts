import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_COPILOT_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";
import { AGENT_COPILOT_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { _getCopilotGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/copilot";
import { _getCopilotEdgeGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/copilot_edge";
import {
  type CopilotContext,
  formatAvailableModels,
  formatAvailableSkills,
  formatAvailableTools,
} from "@app/lib/api/assistant/global_agents/copilot_context";
import {
  MCP_SERVERS_FOR_GLOBAL_AGENTS,
  type MCPServerViewsForGlobalAgentsMap,
} from "@app/lib/api/assistant/global_agents/tools";
import type {
  AvailableSkill,
  AvailableTool,
} from "@app/lib/api/assistant/workspace_capabilities";
import { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { CopilotConfig } from "@app/tests/copilot-evals/lib/types";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_3_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export const RUN_COPILOT_EVAL = process.env.RUN_COPILOT_EVAL === "true";
export const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
export const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
export const FILTER_CATEGORY = process.env.FILTER_CATEGORY;
export const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
export const COPILOT_ON_COPILOT = process.env.COPILOT_ON_COPILOT === "true";
export const COPILOT_AGENT = process.env.COPILOT_AGENT ?? "default";

export const TIMEOUT_MS = 300_000;
export const COPILOT_ON_COPILOT_TIMEOUT_MS = 600_000;
export const MAX_TOOL_CALL_ROUNDS = 5;

export const ONE_HOUR_MS = 3_600_000;
export const ONE_DAY_MS = 86_400_000;

const COPILOT_MCP_SERVERS = [
  AGENT_COPILOT_AGENT_STATE_SERVER,
  AGENT_COPILOT_CONTEXT_SERVER,
] as const;

const GET_AGENT_CONFIG_SPEC: AgentActionSpecification = {
  name: "get_agent_config",
  description:
    "Get the current agent configuration from the agent builder form. Returns name, description, instructionsHtml (with data-block-id for targeting), scope, model, tools, skills, and pending suggestions.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const MOCK_MODEL_IDS = [
  "gpt-4-turbo",
  "gpt-5-mini",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-20250514",
] as const;

const MOCK_WORKSPACE_SKILLS: AvailableSkill[] = [
  {
    sId: "skill_web_search",
    name: "Web Search",
    userFacingDescription: null,
    agentFacingDescription: "Search the web for information",
    icon: null,
    toolSIds: [],
  },
  {
    sId: "skill_data_analysis",
    name: "Data Analysis",
    userFacingDescription: null,
    agentFacingDescription: "Analyze data and generate insights",
    icon: null,
    toolSIds: [],
  },
];

const MOCK_WORKSPACE_TOOLS: AvailableTool[] = [
  {
    sId: "mcp_slack",
    name: "Slack",
    description: "Read and send Slack messages",
    serverType: "internal",
    availability: "manual",
  },
  {
    sId: "mcp_notion",
    name: "Notion",
    description: "Search Notion workspace",
    serverType: "internal",
    availability: "manual",
  },
  {
    sId: "mcp_github",
    name: "GitHub",
    description: "Access GitHub repositories",
    serverType: "internal",
    availability: "manual",
  },
  {
    sId: "mcp_datadog",
    name: "Datadog",
    description: "Search and query Datadog logs and metrics",
    serverType: "internal",
    availability: "manual",
  },
  {
    sId: "mcp_jira",
    name: "JIRA",
    description: "Search and manage JIRA issues and projects",
    serverType: "internal",
    availability: "manual",
  },
];

function getMockCopilotContext(): CopilotContext {
  const models = MOCK_MODEL_IDS.map((id) => getModelConfigByModelId(id)).filter(
    (m): m is NonNullable<typeof m> => m != null
  );
  return {
    mcpServerViews: null,
    formattedUserContext: null,
    formattedWorkspaceContext: [
      formatAvailableModels(models),
      formatAvailableSkills(MOCK_WORKSPACE_SKILLS),
      formatAvailableTools(MOCK_WORKSPACE_TOOLS),
    ].join("\n\n"),
    langfuseConfig: null,
  };
}

const MOCK_MCP_SERVER_VIEWS: MCPServerViewsForGlobalAgentsMap =
  Object.fromEntries(
    MCP_SERVERS_FOR_GLOBAL_AGENTS.map((name) => [name, null])
  ) as MCPServerViewsForGlobalAgentsMap;

export async function getCopilotConfig(): Promise<{
  config: CopilotConfig;
  auth: Authenticator;
}> {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const mockCopilotContext = getMockCopilotContext();
  let copilotConfig;
  switch (COPILOT_AGENT) {
    case "default":
      copilotConfig = _getCopilotGlobalAgent(auth, {
        copilotContext: mockCopilotContext,
        preFetchedDataSources: null,
        mcpServerViews: MOCK_MCP_SERVER_VIEWS,
      });
      break;
    case "haiku":
      copilotConfig = _getCopilotEdgeGlobalAgent(auth, {
        copilotContext: {
          ...mockCopilotContext,
          langfuseConfig: {
            instructions: "",
            modelConfig: CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
          },
        },
        preFetchedDataSources: null,
        mcpServerViews: MOCK_MCP_SERVER_VIEWS,
      });
      break;
    case "gemini-3-light":
      copilotConfig = _getCopilotEdgeGlobalAgent(auth, {
        copilotContext: {
          ...mockCopilotContext,
          langfuseConfig: {
            instructions: "",
            modelConfig: GEMINI_3_FLASH_MODEL_CONFIG,
            reasoningEffort: "light",
          },
        },
        preFetchedDataSources: null,
        mcpServerViews: MOCK_MCP_SERVER_VIEWS,
      });
      break;
    case "gemini-3-medium":
      copilotConfig = _getCopilotEdgeGlobalAgent(auth, {
        copilotContext: {
          ...mockCopilotContext,
          langfuseConfig: {
            instructions: "",
            modelConfig: GEMINI_3_FLASH_MODEL_CONFIG,
            reasoningEffort: "medium",
          },
        },
        preFetchedDataSources: null,
        mcpServerViews: MOCK_MCP_SERVER_VIEWS,
      });
      break;
    default:
      throw new Error(
        `Unknown COPILOT_AGENT: "${COPILOT_AGENT}". Must be "default", "haiku", "gemini-3-light", or "gemini-3-medium".`
      );
  }

  const tools: AgentActionSpecification[] = [GET_AGENT_CONFIG_SPEC];

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
    config: {
      instructions: copilotConfig.instructions ?? "",
      model: copilotConfig.model,
      tools,
    },
    auth,
  };
}
