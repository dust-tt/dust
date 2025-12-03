import { ToolsIcon } from "@dust-tt/sparkle";

import type { ActionSpecification } from "@app/components/agent_builder/types";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import {
  isMCPInternalCatTool,
  isMCPInternalDataSourceFileSystem,
  isMCPInternalInclude,
  isMCPInternalNotion,
  isMCPInternalRunAgent,
  isMCPInternalSearch,
  isMCPInternalSlack,
  isMCPInternalWebsearch,
} from "@app/lib/actions/types/guards";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { AgentConfigurationType } from "@app/types";

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

  if (isMCPInternalCatTool(action)) {
    return 1;
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
