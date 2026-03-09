import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_COPILOT_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_sidekick_agent_state/metadata";
import { AGENT_COPILOT_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import { _getCopilotGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/sidekick";
import { _getCopilotEdgeGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/sidekick_edge";
import type { CopilotContext } from "@app/lib/api/assistant/global_agents/sidekick_context";
import {
  MCP_SERVERS_FOR_GLOBAL_AGENTS,
  type MCPServerViewsForGlobalAgentsMap,
} from "@app/lib/api/assistant/global_agents/tools";
import { Authenticator } from "@app/lib/auth";
import type { CopilotConfig } from "@app/tests/sidekick-evals/lib/types";
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

function getMockCopilotContext(): CopilotContext {
  return {
    mcpServerViews: null,
    langfuseConfig: null,
  };
}

// In production, run_model.ts injects <user_context> and <workspace_context> into
// the dynamic context block. The evals bypass run_model.ts and call the LLM directly,
// so we append mock context to the instructions to simulate runtime injection.
const MOCK_WORKSPACE_CONTEXT = [
  "<workspace_context>",
  "## AVAILABLE MODELS",
  "4 models available.",
  "",
  "### openai",
  "- **GPT 4 Turbo** (modelId: gpt-4-turbo): OpenAI's fast, intelligent flagship model (no vision)",
  "- **GPT 5 Mini** (modelId: gpt-5-mini): OpenAI's fastest model. Designed for quick, everyday tasks (no vision)",
  "### anthropic",
  "- **Claude Sonnet 4.5** (modelId: claude-sonnet-4-5-20250929): Claude Sonnet 4.5 (no vision)",
  "- **Claude Opus 4** (modelId: claude-opus-4-20250514): Claude Opus 4 (no vision)",
  "",
  "## AVAILABLE SKILLS",
  "2 skills available.",
  "",
  "- **Web Search** (ID: skill_web_search): Search the web for information",
  "- **Data Analysis** (ID: skill_data_analysis): Analyze data and generate insights",
  "",
  "## AVAILABLE TOOLS",
  "5 tools available.",
  "",
  "- **Slack** (ID: mcp_slack): Read and send Slack messages",
  "- **Notion** (ID: mcp_notion): Search Notion workspace",
  "- **GitHub** (ID: mcp_github): Access GitHub repositories",
  "- **Datadog** (ID: mcp_datadog): Search and query Datadog logs and metrics",
  "- **JIRA** (ID: mcp_jira): Search and manage JIRA issues and projects",
  "</workspace_context>",
].join("\n");

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

  const instructions = [
    copilotConfig.instructions ?? "",
    MOCK_WORKSPACE_CONTEXT,
  ].join("\n\n");

  return {
    config: {
      instructions,
      model: copilotConfig.model,
      tools,
    },
    auth,
  };
}
