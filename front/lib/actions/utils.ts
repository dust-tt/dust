import { ToolsIcon } from "@dust-tt/sparkle";

import type { ActionSpecification } from "@app/components/assistant_builder/types";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import {
  isMCPInternalDataSourceFileSystem,
  isMCPInternalInclude,
  isMCPInternalNotion,
  isMCPInternalRunAgent,
  isMCPInternalSearch,
  isMCPInternalSlack,
  isMCPInternalWebsearch,
} from "@app/lib/actions/types/guards";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentConfigurationType, AgentMessageType } from "@app/types";
import { assertNever } from "@app/types";

export const WEBSEARCH_ACTION_NUM_RESULTS = 16;
export const SLACK_SEARCH_ACTION_NUM_RESULTS = 24;
export const NOTION_SEARCH_ACTION_NUM_RESULTS = 16;
export const RUN_AGENT_ACTION_NUM_RESULTS = 64;

export const MCP_SPECIFICATION: ActionSpecification = {
  label: "More...",
  description: "Add additional sets of tools",
  cardIcon: ToolsIcon,
  dropDownIcon: ToolsIcon,
  flag: null,
};

/**
 * This function computes the topK for retrieval actions. This is used by both the action (to
 * compute the topK) and computing the citation counts for retrieval actions (mcp included)
 *
 * We share the topK across retrieval actions from the same step. If there are multiple retrieval
 * actions in the same step we get the maximum topK and divide it by the number of retrieval actions
 * in the step.
 */
export function getRetrievalTopK({
  agentConfiguration,
  stepActions,
}: {
  agentConfiguration: AgentConfigurationType;
  stepActions: MCPToolConfigurationType[];
}): number {
  const model = getSupportedModelConfig(agentConfiguration.model);

  const searchActions = stepActions.filter(isMCPInternalSearch);
  const includeActions = stepActions.filter(isMCPInternalInclude);
  const dsFsActions = stepActions.filter(isMCPInternalDataSourceFileSystem);

  const actionsCount =
    searchActions.length + includeActions.length + dsFsActions.length;

  if (actionsCount === 0) {
    return 0;
  }

  const topKs = searchActions
    .map(() => model.recommendedTopK)
    .concat(includeActions.map(() => model.recommendedExhaustiveTopK))
    .concat(dsFsActions.map(() => model.recommendedTopK));

  return Math.ceil(Math.max(...topKs) / actionsCount);
}

/**
 * This function computes the number of results for websearch actions. This is used by both the
 * action (to compute the number of results) and computing the citation counts for websearch
 * actions.
 *
 * We share the number of results across websearch actions from the same step. If there are multiple
 * websearch actions in the same step we get the maximum number of results and divide it by The
 * number of websearch actions in the step.
 */
export function getWebsearchNumResults({
  stepActions,
}: {
  stepActions: MCPToolConfigurationType[];
}): number {
  const websearchActions = stepActions.filter(isMCPInternalWebsearch);
  const totalActions = websearchActions.length;

  if (totalActions === 0) {
    return 0;
  }

  return Math.ceil(WEBSEARCH_ACTION_NUM_RESULTS / totalActions);
}

/**
 * This function computes the number of citations per actions within one step. It is centralized
 * here as it is used from the runners and across runners which leads to circular imports.
 *
 * It works as follows:
 * - Returns 0 for actions that do not have citations.
 * - Returns the shared topK for retrieval actions.
 * - Returns the shared number of results for websearch actions.
 */
export function getCitationsCount({
  agentConfiguration,
  stepActions,
  stepActionIndex,
}: {
  agentConfiguration: AgentConfigurationType;
  stepActions: MCPToolConfigurationType[];
  stepActionIndex: number;
}): number {
  const action = stepActions[stepActionIndex];

  if (isMCPInternalWebsearch(action)) {
    return getWebsearchNumResults({
      stepActions,
    });
  }

  if (isMCPInternalSlack(action)) {
    return SLACK_SEARCH_ACTION_NUM_RESULTS;
  }

  if (isMCPInternalNotion(action)) {
    return NOTION_SEARCH_ACTION_NUM_RESULTS;
  }

  if (isMCPInternalRunAgent(action)) {
    return RUN_AGENT_ACTION_NUM_RESULTS;
  }

  return getRetrievalTopK({
    agentConfiguration,
    stepActions,
  });
}

export function computeStepContexts({
  agentConfiguration,
  stepActions,
  citationsRefsOffset,
}: {
  agentConfiguration: AgentConfigurationType;
  stepActions: MCPToolConfigurationType[];
  citationsRefsOffset: number;
}): StepContext[] {
  const retrievalTopK = getRetrievalTopK({
    agentConfiguration,
    stepActions,
  });

  const websearchResults = getWebsearchNumResults({
    stepActions,
  });

  const stepContexts: StepContext[] = [];
  let currentOffset = citationsRefsOffset;

  for (let i = 0; i < stepActions.length; i++) {
    const citationsCount = getCitationsCount({
      agentConfiguration,
      stepActions,
      stepActionIndex: i,
    });

    stepContexts.push({
      citationsCount,
      citationsOffset: currentOffset,
      resumeState: null,
      retrievalTopK,
      websearchResultCount: websearchResults,
    });

    currentOffset += citationsCount;
  }

  return stepContexts;
}

export async function getExecutionStatusFromConfig(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType,
  agentMessage: AgentMessageType
): Promise<{
  stake?: MCPToolStakeLevelType;
  status: "ready_allowed_implicitly" | "blocked_validation_required";
  serverId?: string;
}> {
  // If the agent message is marked as "skipToolsValidation" we skip all tools validation
  // irrespective of the `actionConfiguration.permission`. This is set when the agent message was
  // created by an API call where the caller explicitly set `skipToolsValidation` to true.
  if (agentMessage.skipToolsValidation) {
    return { status: "ready_allowed_implicitly" };
  }

  // Permissions:
  // - "never_ask": Automatically approved
  // - "low": Ask user for approval and allow to automatically approve next time
  // - "high": Ask for approval each time
  // - undefined: Use default permission ("never_ask" for default tools, "high" for other tools)
  switch (actionConfiguration.permission) {
    case "never_ask":
      return { status: "ready_allowed_implicitly" };
    case "low": {
      // The user may not be populated, notably when using the public API.
      const user = auth.user();

      if (
        user &&
        (await hasUserAlwaysApprovedTool({
          user,
          mcpServerId: actionConfiguration.toolServerId,
          functionCallName: actionConfiguration.name,
        }))
      ) {
        return { status: "ready_allowed_implicitly" };
      }
      return { status: "blocked_validation_required" };
    }
    case "high":
      return { status: "blocked_validation_required" };
    default:
      assertNever(actionConfiguration.permission);
  }
}

const TOOLS_VALIDATION_WILDCARD = "*";

const getToolsValidationKey = (mcpServerId: string) =>
  `toolsValidations:${mcpServerId}`;

// The function call name is scoped by MCP servers so that the same tool name on different servers
// does not conflict, which is why we use it here instead of the tool name.
export async function setUserAlwaysApprovedTool({
  user,
  mcpServerId,
  functionCallName,
}: {
  user: UserResource;
  mcpServerId: string;
  functionCallName: string;
}) {
  if (!functionCallName) {
    throw new Error("functionCallName is required");
  }
  if (!mcpServerId) {
    throw new Error("mcpServerId is required");
  }

  await user.upsertMetadataArray(
    getToolsValidationKey(mcpServerId),
    functionCallName
  );
}

export async function hasUserAlwaysApprovedTool({
  user,
  mcpServerId,
  functionCallName,
}: {
  user: UserResource;
  mcpServerId: string;
  functionCallName: string;
}) {
  if (!mcpServerId) {
    throw new Error("mcpServerId is required");
  }

  if (!functionCallName) {
    throw new Error("functionCallName is required");
  }

  const metadata = await user.getMetadataAsArray(
    getToolsValidationKey(mcpServerId)
  );
  return (
    metadata.includes(functionCallName) ||
    metadata.includes(TOOLS_VALIDATION_WILDCARD)
  );
}
