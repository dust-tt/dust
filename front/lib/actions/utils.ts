import {
  BarChartIcon,
  BoltIcon,
  ChatBubbleThoughtIcon,
  CommandLineIcon,
  MagnifyingGlassIcon,
  PlanetIcon,
  ScanIcon,
  TableIcon,
  TimeIcon,
} from "@dust-tt/sparkle";

import type {
  ActionSpecification,
  AssistantBuilderActionConfiguration,
} from "@app/components/assistant_builder/types";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isMCPInternalDataSourceFileSystem,
  isMCPInternalInclude,
  isMCPInternalSearch,
  isMCPInternalWebsearch,
  isRetrievalConfiguration,
  isServerSideMCPToolConfiguration,
  isWebsearchConfiguration,
} from "@app/lib/actions/types/guards";
import type { WebsearchConfigurationType } from "@app/lib/actions/websearch";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationType, AgentMessageType } from "@app/types";
import { assertNever } from "@app/types";

export const WEBSEARCH_ACTION_NUM_RESULTS = 16;

export const ACTION_SPECIFICATIONS: Record<
  AssistantBuilderActionConfiguration["type"],
  ActionSpecification
> = {
  RETRIEVAL_EXHAUSTIVE: {
    label: "Include data",
    description: "Include data exhaustively",
    cardIcon: TimeIcon,
    dropDownIcon: TimeIcon,
    flag: null,
  },
  RETRIEVAL_SEARCH: {
    label: "Search",
    description: "Search through selected Data sources",
    cardIcon: MagnifyingGlassIcon,
    dropDownIcon: MagnifyingGlassIcon,
    flag: null,
  },
  PROCESS: {
    label: "Extract data",
    description: "Structured extraction",
    cardIcon: ScanIcon,
    dropDownIcon: ScanIcon,
    flag: null,
  },
  DUST_APP_RUN: {
    label: "Run a Dust App",
    description: "Run a Dust app, then reply",
    cardIcon: CommandLineIcon,
    dropDownIcon: CommandLineIcon,
    flag: null,
  },
  TABLES_QUERY: {
    label: "Query Tables",
    description: "Tables, Spreadsheets, Notion DBs (quantitative)",
    cardIcon: TableIcon,
    dropDownIcon: TableIcon,
    flag: null,
  },
  WEB_NAVIGATION: {
    label: "Web navigation",
    description:
      "Navigate the web (browse any provided links, make a google search, etc.)",
    cardIcon: PlanetIcon,
    dropDownIcon: PlanetIcon,
    flag: null,
  },
  REASONING: {
    label: "Reasoning",
    description: "Complex step by step reasoning",
    cardIcon: ChatBubbleThoughtIcon,
    dropDownIcon: ChatBubbleThoughtIcon,
    flag: null,
  },
  MCP: {
    label: "More...",
    description: "Add additional sets of tools",
    cardIcon: BoltIcon,
    dropDownIcon: BoltIcon,
    flag: null,
  },
};

export const DATA_VISUALIZATION_SPECIFICATION: ActionSpecification = {
  label: "Data Visualization",
  description: "Generate a data visualization",
  cardIcon: BarChartIcon,
  dropDownIcon: BarChartIcon,
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
  stepActions: ActionConfigurationType[];
}): number {
  const model = getSupportedModelConfig(agentConfiguration.model);

  const retrievalActions = stepActions.filter(isRetrievalConfiguration);
  const searchActions = stepActions.filter(isMCPInternalSearch);
  const includeActions = stepActions.filter(isMCPInternalInclude);
  const dsFsActions = stepActions.filter(isMCPInternalDataSourceFileSystem);

  const actionsCount =
    retrievalActions.length +
    searchActions.length +
    includeActions.length +
    dsFsActions.length;

  if (actionsCount === 0) {
    return 0;
  }

  const topKs = retrievalActions
    .map((action) => {
      if (action.topK === "auto") {
        if (action.query === "none") {
          return model.recommendedExhaustiveTopK;
        } else {
          return model.recommendedTopK;
        }
      } else {
        return action.topK;
      }
    })
    .concat(
      searchActions.map(() => {
        return model.recommendedTopK;
      })
    )
    .concat(
      includeActions.map(() => {
        return model.recommendedExhaustiveTopK;
      })
    )
    .concat(
      dsFsActions.map(() => {
        return model.recommendedTopK;
      })
    );

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
  stepActions: ActionConfigurationType[];
}): number {
  const websearchActions: WebsearchConfigurationType[] = stepActions.filter(
    isWebsearchConfiguration
  );

  const websearchV2Actions = stepActions.filter(isMCPInternalWebsearch);

  const numResults = websearchActions
    .map(() => {
      return WEBSEARCH_ACTION_NUM_RESULTS;
    })
    .concat(
      websearchV2Actions.map(() => {
        return WEBSEARCH_ACTION_NUM_RESULTS;
      })
    );

  const totalActions = websearchActions.length + websearchV2Actions.length;

  if (totalActions === 0) {
    return 0;
  }

  return Math.ceil(Math.max(...numResults) / totalActions);
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
  stepActions: ActionConfigurationType[];
  stepActionIndex: number;
}): number {
  const action = stepActions[stepActionIndex];

  switch (action.type) {
    case "retrieval_configuration":
      return getRetrievalTopK({
        agentConfiguration,
        stepActions,
      });
    case "websearch_configuration":
      return getWebsearchNumResults({
        stepActions,
      });
    case "tables_query_configuration":
    case "dust_app_run_configuration":
    case "process_configuration":
    case "browse_configuration":
    case "conversation_include_file_configuration":
    case "search_labels_configuration":
    case "reasoning_configuration":
      return 0;
    case "mcp_configuration":
      if (
        isServerSideMCPToolConfiguration(action) &&
        isInternalMCPServerOfName(
          action.internalMCPServerId,
          "web_search_&_browse"
        )
      ) {
        return getWebsearchNumResults({
          stepActions,
        });
      }
      return getRetrievalTopK({
        agentConfiguration,
        stepActions,
      });
    default:
      assertNever(action);
  }
}

/**
 * This is shared across action runners and used to compute the local step refsOffset (the current
 * refsOffset for the agent actions up to the current step (`refsOffset`) to which we add the
 * actions that comes before the current action in the current step).
 *
 * @param agentConfiguration The agent configuration.
 * @param stepActionIndex The index of the current action in the current step.
 * @param stepActions The actions in the current step.
 * @param refsOffset The current refsOffset up to the current step.
 * @returns The updated refsOffset for the action at stepActionIndex.
 */
export function actionRefsOffset({
  agentConfiguration,
  stepActionIndex,
  stepActions,
  refsOffset,
}: {
  agentConfiguration: AgentConfigurationType;
  stepActionIndex: number;
  stepActions: ActionConfigurationType[];
  refsOffset: number;
}): number {
  for (let i = 0; i < stepActionIndex; i++) {
    refsOffset += getCitationsCount({
      agentConfiguration,
      stepActions,
      stepActionIndex: i,
    });
  }

  return refsOffset;
}

export function getMCPApprovalKey({
  conversationId,
  messageId,
  actionId,
}: {
  conversationId: string;
  messageId: string;
  actionId: number;
}): string {
  return `conversation:${conversationId}:message:${messageId}:action:${actionId}`;
}

export async function getExecutionStatusFromConfig(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType,
  agentMessage: AgentMessageType
): Promise<{
  stake?: MCPToolStakeLevelType;
  status: "allowed_implicitly" | "pending";
  serverId?: string;
}> {
  // If the agent message is marked as "skipToolsValidation" we skip all tools validation
  // irrespective of the `actionConfiguration.permission`. This is set when the agent message was
  // created by an API call where the caller explicitly set `skipToolsValidation` to true.
  if (agentMessage.skipToolsValidation) {
    return { status: "allowed_implicitly" };
  }

  // Permissions:
  // - "never_ask": Automatically approved
  // - "low": Ask user for approval and allow to automatically approve next time
  // - "high": Ask for approval each time
  // - undefined: Use default permission ("never_ask" for default tools, "high" for other tools)
  switch (actionConfiguration.permission) {
    case "never_ask":
      return { status: "allowed_implicitly" };
    case "low": {
      // The user may not be populated, notably when using the public API.
      const user = auth.user();
      const neverAskSetting = await user?.getMetadata(
        `toolsValidations:${actionConfiguration.toolServerId}`
      );

      if (
        neverAskSetting &&
        neverAskSetting.value.includes(`${actionConfiguration.name}`)
      ) {
        return { status: "allowed_implicitly" };
      }
      return { status: "pending" };
    }
    case "high":
      return { status: "pending" };
    default:
      assertNever(actionConfiguration.permission);
  }
}
