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

export function getCitationsCount({
  agentConfiguration,
  stepActions,
}: {
  agentConfiguration: AgentConfigurationType;
  stepActions: AgentActionConfigurationType[];
}): number {
  const actionsWithCitations: (
    | RetrievalConfigurationType
    | WebsearchConfigurationType
  )[] = [];
  for (const a of stepActions) {
    if (
      a.type === "retrieval_configuration" ||
      a.type === "websearch_configuration"
    ) {
      actionsWithCitations.push(a);
    }
  }
  const actionsWithCitationsCount = actionsWithCitations.length;

  if (actionsWithCitationsCount === 0) {
    throw new Error("Unexpected: found 0 actions with citations");
  }

  const model = getSupportedModelConfig(agentConfiguration.model);

  // We find the retrieval action in the step with the highest topK.
  const maxTopK = actionsWithCitations
    .map((a) => {
      if (a.type === "retrieval_configuration") {
        if (a.topK === "auto") {
          if (a.query === "none") {
            return model.recommendedExhaustiveTopK;
          } else {
            return model.recommendedTopK;
          }
        } else {
          return a.topK;
        }
      } else if (a.type === "websearch_configuration") {
        return WEBSEARCH_ACTION_NUM_RESULTS;
      } else {
        assertNever(a);
      }
    })
    .reduce((acc, topK) => Math.max(acc, topK), 0);

  // We split the topK evenly among all retrieval actions of the step.
  return Math.ceil(maxTopK / actionsWithCitationsCount);
}
