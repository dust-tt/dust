import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_SIDEKICK_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_sidekick_agent_state/metadata";
import { AGENT_SIDEKICK_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import { ASK_USER_QUESTION_SERVER } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import { _getSidekickGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/sidekick";
import type { SidekickContext } from "@app/lib/api/assistant/global_agents/sidekick_context";
import type { MCPServerViewsForGlobalAgentsMap } from "@app/lib/api/assistant/global_agents/tools";
import { MCP_SERVERS_FOR_GLOBAL_AGENTS } from "@app/lib/api/assistant/global_agents/tools";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { SidekickConfig } from "@app/tests/sidekick-evals/lib/types";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { isModelId } from "@app/types/assistant/models/models";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const RUN_SIDEKICK_EVAL = process.env.RUN_SIDEKICK_EVAL === "true";
export const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
export const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
export const FILTER_CATEGORY = process.env.FILTER_CATEGORY;
export const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
export const SIDEKICK_ON_SIDEKICK = process.env.SIDEKICK_ON_SIDEKICK === "true";
export const SIDEKICK_AGENT = process.env.SIDEKICK_AGENT ?? "default";

// Optional overrides to benchmark the sidekick against a specific model instead
// of the one returned by `_getSidekickGlobalAgent`.
export const SIDEKICK_MODEL_ID = process.env.SIDEKICK_MODEL_ID;
export const SIDEKICK_REASONING_EFFORT = process.env.SIDEKICK_REASONING_EFFORT;

export const TIMEOUT_MS = 300_000;
export const SIDEKICK_ON_SIDEKICK_TIMEOUT_MS = 600_000;
// Production allows MAX_STEPS_USE_PER_RUN_LIMIT (64) steps. A low cap here
// silently truncates the run before the sidekick's closing message, leaving the
// judge with an empty response, so keep enough headroom for multi-suggestion
// scenarios. Hitting the cap is reported as a failure rather than judged.
export const MAX_TOOL_CALL_ROUNDS = 12;

export const ONE_HOUR_MS = 3_600_000;
export const ONE_DAY_MS = 86_400_000;

const SIDEKICK_MCP_SERVERS = [
  AGENT_SIDEKICK_AGENT_STATE_SERVER,
  AGENT_SIDEKICK_CONTEXT_SERVER,
  // <asking_questions> in the sidekick instructions requires this tool for
  // clarifying questions, so it has to be part of the specs the model sees.
  ASK_USER_QUESTION_SERVER,
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

function getMockSidekickContext(): SidekickContext {
  return {
    mcpServerViews: null,
  };
}

// In production, run_model.ts injects <user_context> and <workspace_context> into
// the dynamic context block. The evals bypass run_model.ts and call the LLM directly,
// so we append mock context to the instructions to simulate runtime injection.
const MOCK_WORKSPACE_CONTEXT = [
  "<workspace_context>",
  "<available_models>",
  '<provider id="openai">',
  "- **GPT 4 Turbo** (modelId: gpt-4-turbo): OpenAI's fast, intelligent flagship model (no vision)",
  "- **GPT 5 Mini** (modelId: gpt-5-mini): OpenAI's fastest model. Designed for quick, everyday tasks (no vision)",
  "</provider>",
  "",
  '<provider id="anthropic">',
  "- **Claude Sonnet 4.5** (modelId: claude-sonnet-4-5-20250929): Claude Sonnet 4.5 (no vision)",
  "- **Claude Opus 4** (modelId: claude-opus-4-20250514): Claude Opus 4 (no vision)",
  "</provider>",
  "</available_models>",
  "",
  "<available_skills>",
  '<skill ID="skill_web_search" name="Web Search">',
  "  Search the web for information",
  "</skill>",
  '<skill ID="skill_data_analysis" name="Data Analysis">',
  "  Analyze data and generate insights",
  "</skill>",
  "</available_skills>",
  "",
  "<available_tools>",
  '<tool ID="mcp_slack" name="Slack">Read and send Slack messages</tool>',
  '<tool ID="mcp_notion" name="Notion">Search Notion workspace</tool>',
  '<tool ID="mcp_github" name="GitHub">Access GitHub repositories</tool>',
  '<tool ID="mcp_datadog" name="Datadog">Search and query Datadog logs and metrics</tool>',
  '<tool ID="mcp_jira" name="JIRA">Search and manage JIRA issues and projects</tool>',
  "</available_tools>",
  "</workspace_context>",
].join("\n");

const MOCK_MCP_SERVER_VIEWS: MCPServerViewsForGlobalAgentsMap =
  Object.fromEntries(
    MCP_SERVERS_FOR_GLOBAL_AGENTS.map((name) => [name, null])
  ) as MCPServerViewsForGlobalAgentsMap;

// Applies the SIDEKICK_MODEL_ID / SIDEKICK_REASONING_EFFORT overrides on top of the
// model the sidekick global agent would normally use.
function resolveSidekickModel(
  model: SidekickConfig["model"]
): SidekickConfig["model"] {
  if (!SIDEKICK_MODEL_ID && !SIDEKICK_REASONING_EFFORT) {
    return model;
  }

  const modelId = SIDEKICK_MODEL_ID ?? model.modelId;
  if (!isModelId(modelId)) {
    throw new Error(`Unknown SIDEKICK_MODEL_ID: "${modelId}".`);
  }

  const modelConfig = getModelConfigByModelId(modelId);
  if (!modelConfig) {
    throw new Error(`No model configuration found for model "${modelId}".`);
  }

  const availableEfforts = getAvailableReasoningEfforts(
    modelConfig.supportedReasoningEfforts
  );
  const reasoningEffort = SIDEKICK_REASONING_EFFORT
    ? availableEfforts.find((effort) => effort === SIDEKICK_REASONING_EFFORT)
    : modelConfig.defaultReasoningEffort;
  if (!reasoningEffort) {
    throw new Error(
      `Unsupported SIDEKICK_REASONING_EFFORT "${SIDEKICK_REASONING_EFFORT}" for ` +
        `model "${modelId}". Supported: ${availableEfforts.join(", ")}.`
    );
  }

  return { modelId, temperature: model.temperature, reasoningEffort };
}

export async function getSidekickConfig(): Promise<{
  config: SidekickConfig;
  auth: Authenticator;
}> {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const mockSidekickContext = getMockSidekickContext();
  if (SIDEKICK_AGENT !== "default") {
    throw new Error(
      `Unknown SIDEKICK_AGENT: "${SIDEKICK_AGENT}". Must be "default".`
    );
  }

  const featureFlags = await getFeatureFlags(auth);
  const sidekickConfig = _getSidekickGlobalAgent(auth, {
    sidekickContext: mockSidekickContext,
    preFetchedDataSources: null,
    mcpServerViews: MOCK_MCP_SERVER_VIEWS,
    featureFlags,
  });

  const tools: AgentActionSpecification[] = [GET_AGENT_CONFIG_SPEC];

  for (const server of SIDEKICK_MCP_SERVERS) {
    for (const tool of server.tools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(z.object(tool.schema)) as JSONSchema,
      });
    }
  }

  const instructions = [
    sidekickConfig.instructions ?? "",
    MOCK_WORKSPACE_CONTEXT,
  ].join("\n\n");

  return {
    config: {
      instructions,
      model: resolveSidekickModel(sidekickConfig.model),
      tools,
    },
    auth,
  };
}
