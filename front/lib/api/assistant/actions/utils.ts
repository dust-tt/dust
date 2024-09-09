import type { Icon } from "@dust-tt/sparkle";
import {
  CommandLineIcon,
  MagnifyingGlassIcon,
  PlanetIcon,
  ScanIcon,
  TableIcon,
  TimeIcon,
} from "@dust-tt/sparkle";
import type {
  AgentActionConfigurationType,
  AgentConfigurationType,
  RetrievalConfigurationType,
  WebsearchConfigurationType,
  WhitelistableFeature,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import assert from "assert";

import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";
import { getSupportedModelConfig } from "@app/lib/assistant";

export const WEBSEARCH_ACTION_NUM_RESULTS = 16;

export const ACTION_SPECIFICATIONS: Record<
  AssistantBuilderActionConfiguration["type"],
  {
    label: string;
    description: string;
    dropDownIcon: React.ComponentProps<typeof Icon>["visual"];
    cardIcon: React.ComponentProps<typeof Icon>["visual"];
    flag: WhitelistableFeature | null;
  }
> = {
  RETRIEVAL_EXHAUSTIVE: {
    label: "Most recent data",
    description: "Include as much data as possible",
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
};

/**
 * This function computes the topK for retrieval actions. This is used by both the action (to
 * compute the topK) and computing the citation counts for retrieval actions.
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
  stepActions: AgentActionConfigurationType[];
}): number {
  const model = getSupportedModelConfig(agentConfiguration.model);

  const retrievalActions = stepActions.filter(
    (action) => action.type === "retrieval_configuration"
  ) as RetrievalConfigurationType[];

  assert(
    retrievalActions.length > 0,
    "No retrieval actions found in `getRetrievalTopK`"
  );

  const topKs = retrievalActions.map((action) => {
    if (action.topK === "auto") {
      if (action.query === "none") {
        return model.recommendedExhaustiveTopK;
      } else {
        return model.recommendedTopK;
      }
    } else {
      return action.topK;
    }
  });

  return Math.ceil(Math.max(...topKs) / retrievalActions.length);
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
  stepActions: AgentActionConfigurationType[];
}): number {
  const websearchActions = stepActions.filter(
    (action) => action.type === "websearch_configuration"
  ) as WebsearchConfigurationType[];

  assert(
    websearchActions.length > 0,
    "No websearch actions found in `getWebsearchNumResults`"
  );

  const numResults = websearchActions.map(() => {
    return WEBSEARCH_ACTION_NUM_RESULTS;
  });

  return Math.ceil(Math.max(...numResults) / websearchActions.length);
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
  stepActions: AgentActionConfigurationType[];
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
      return 0;
    default:
      assertNever(action);
  }
}

/**
 * This is shared across action runners and used to compute the local step refsOffset (the current
 * refsOffset for the assistant actions up to the current step (`refsOffset`) to which we add the
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
  stepActions: AgentActionConfigurationType[];
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
