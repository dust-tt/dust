import { _getDustGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import type { MCPServerViewsForGlobalAgentsMap } from "@app/lib/api/assistant/global_agents/tools";
import { MCP_SERVERS_FOR_GLOBAL_AGENTS } from "@app/lib/api/assistant/global_agents/tools";
import { getEnabledSkillInstructions } from "@app/lib/api/assistant/skills_rendering";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { conversationalBuildingSkill } from "@app/lib/resources/skill/code_defined/global/conversational_building";
import { getToolSpecifications } from "@app/tests/conversational-building-evals/lib/tool-runner";
import type { BuildingAgentConfig } from "@app/tests/conversational-building-evals/lib/types";
import { isModelId } from "@app/types/assistant/models/models";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";

export const RUN_CONVERSATIONAL_BUILDING_EVAL =
  process.env.RUN_CONVERSATIONAL_BUILDING_EVAL === "true";
export const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
export const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
export const FILTER_CATEGORY = process.env.FILTER_CATEGORY;
export const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
export const VERBOSE = process.env.VERBOSE === "true";

// Optional overrides to benchmark the skill against a specific model instead of the one the
// global agent would normally use.
export const BUILDING_MODEL_ID = process.env.BUILDING_MODEL_ID;
export const BUILDING_REASONING_EFFORT = process.env.BUILDING_REASONING_EFFORT;

export const TIMEOUT_MS = 300_000;
export const SEED_TIMEOUT_MS = 600_000;
// Production allows MAX_STEPS_USE_PER_RUN_LIMIT steps. Hitting this cap is reported as a
// failure rather than judged, so keep headroom for list -> describe -> suggest -> closing text.
export const MAX_TOOL_CALL_ROUNDS = 12;

const MOCK_MCP_SERVER_VIEWS: MCPServerViewsForGlobalAgentsMap =
  Object.fromEntries(
    MCP_SERVERS_FOR_GLOBAL_AGENTS.map((name) => [name, null])
  ) as MCPServerViewsForGlobalAgentsMap;

// Applies the BUILDING_MODEL_ID / BUILDING_REASONING_EFFORT overrides on top of the model the
// global agent would normally use.
function resolveModel(
  model: BuildingAgentConfig["model"]
): BuildingAgentConfig["model"] {
  if (!BUILDING_MODEL_ID && !BUILDING_REASONING_EFFORT) {
    return model;
  }

  const modelId = BUILDING_MODEL_ID ?? model.modelId;
  if (!isModelId(modelId)) {
    throw new Error(`Unknown BUILDING_MODEL_ID: "${modelId}".`);
  }

  const modelConfig = getModelConfigByModelId(modelId);
  if (!modelConfig) {
    throw new Error(`No model configuration found for model "${modelId}".`);
  }

  const availableEfforts = getAvailableReasoningEfforts(
    modelConfig.supportedReasoningEfforts
  );
  const reasoningEffort = BUILDING_REASONING_EFFORT
    ? availableEfforts.find((effort) => effort === BUILDING_REASONING_EFFORT)
    : modelConfig.defaultReasoningEffort;
  if (!reasoningEffort) {
    throw new Error(
      `Unsupported BUILDING_REASONING_EFFORT "${BUILDING_REASONING_EFFORT}" for ` +
        `model "${modelId}". Supported: ${availableEfforts.join(", ")}.`
    );
  }

  return { modelId, temperature: model.temperature, reasoningEffort };
}

/** Builds the Dust global agent for the given workspace, with the skill's tools attached. */
export async function getBuildingAgentConfig(
  auth: Authenticator
): Promise<BuildingAgentConfig> {
  const featureFlags = await getFeatureFlags(auth);

  const agent = _getDustGlobalAgent(auth, {
    settings: null,
    preFetchedDataSources: null,
    mcpServerViews: MOCK_MCP_SERVER_VIEWS,
    hasDeepDive: false,
    featureFlags,
  });
  if (!agent) {
    throw new Error("Could not build the dust global agent.");
  }

  // Mirrors renderEnabledSkillUserMessageFromInstructions, which needs a SkillResource.
  const skillInstructionsMessage = `<dust_system>\n${getEnabledSkillInstructions(
    conversationalBuildingSkill
  )}\n</dust_system>`;

  return {
    agentId: agent.sId,
    instructions: agent.instructions ?? "",
    skillInstructionsMessage,
    model: resolveModel({
      modelId: agent.model.modelId,
      temperature: agent.model.temperature,
      reasoningEffort: agent.model.reasoningEffort,
    }),
    // The agent only sees the tools of the servers the skill equips, not the rest of Dust's
    // toolsets: the eval measures the skill.
    tools: getToolSpecifications(),
  };
}
