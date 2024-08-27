import type {
  AgentModelConfigurationType,
  ConnectorProvider,
  LightAgentConfigurationType,
} from "@dust-tt/types";
import type { SupportedModel } from "@dust-tt/types";
import { SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

export function isLargeModel(model: unknown): model is SupportedModel {
  const maybeSupportedModel = model as SupportedModel;
  const m = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === maybeSupportedModel.modelId &&
      m.providerId === maybeSupportedModel.providerId
  );
  if (m) {
    return m.largeModel;
  }
  return false;
}

export function getSupportedModelConfig(
  supportedModel: SupportedModel | AgentModelConfigurationType
) {
  // here it is safe to cast the result to non-nullable because SupportedModel
  // is derived from the const array of configs above
  return SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === supportedModel.modelId &&
      m.providerId === supportedModel.providerId
  ) as (typeof SUPPORTED_MODEL_CONFIGS)[number];
}

/**
 * Global agent list (stored here to be imported from client-side)
 */

export enum GLOBAL_AGENTS_SID {
  HELPER = "helper",
  DUST = "dust",
  SLACK = "slack",
  GOOGLE_DRIVE = "google_drive",
  NOTION = "notion",
  GITHUB = "github",
  INTERCOM = "intercom",
  GPT35_TURBO = "gpt-3.5-turbo",
  GPT4 = "gpt-4",
  CLAUDE_3_OPUS = "claude-3-opus",
  CLAUDE_3_SONNET = "claude-3-sonnet",
  CLAUDE_3_HAIKU = "claude-3-haiku",
  CLAUDE_2 = "claude-2",
  CLAUDE_INSTANT = "claude-instant-1",
  MISTRAL_LARGE = "mistral-large",
  MISTRAL_MEDIUM = "mistral-medium",
  //!\ TEMPORARY WORKAROUND: Renaming 'mistral' to 'mistral-small' is not feasible since
  // it interferes with the retrieval of ongoing conversations involving this agent.
  // Needed to preserve ongoing chat integrity due to 'sId=mistral' references in legacy messages.
  MISTRAL_SMALL = "mistral",
  GEMINI_PRO = "gemini-pro",
}

export function getGlobalAgentAuthorName(agentId: string): string {
  switch (agentId) {
    case GLOBAL_AGENTS_SID.GPT4:
      return "OpenAI";
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      return "Anthropic";
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return "Mistral";
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      return "Google";
    default:
      return "Dust";
  }
}

const CUSTOM_ORDER: string[] = [
  GLOBAL_AGENTS_SID.DUST,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.MISTRAL_LARGE,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.GEMINI_PRO,
  GLOBAL_AGENTS_SID.HELPER,
];

// This function implements our general strategy to sort agents to users (input bar, assistant list,
// agent suggestions...).
export function compareAgentsForSort(
  a: LightAgentConfigurationType,
  b: LightAgentConfigurationType
) {
  // Check for 'dust'
  if (a.sId === GLOBAL_AGENTS_SID.DUST) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.DUST) {
    return 1;
  }

  // Check for 'gpt4'
  if (a.sId === GLOBAL_AGENTS_SID.GPT4) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.GPT4) {
    return 1;
  }

  // Check for agents with non-global 'scope'
  if (a.scope !== "global" && b.scope === "global") {
    return -1;
  }
  if (b.scope !== "global" && a.scope === "global") {
    return 1;
  }

  // Check for customOrder (slack, notion, googledrive, github, claude)
  const aIndex = CUSTOM_ORDER.indexOf(a.sId);
  const bIndex = CUSTOM_ORDER.indexOf(b.sId);

  if (aIndex !== -1 && bIndex !== -1) {
    return aIndex - bIndex; // Both are in customOrder, sort them accordingly
  }

  if (aIndex !== -1) {
    return -1;
  } // Only a is in customOrder, it comes first
  if (bIndex !== -1) {
    return 1;
  } // Only b is in customOrder, it comes first

  return 0; // Default: keep the original order
}

function getConnectorOrder() {
  return Object.keys(CONNECTOR_CONFIGURATIONS)
    .filter(
      (key) =>
        CONNECTOR_CONFIGURATIONS[key as keyof typeof CONNECTOR_CONFIGURATIONS]
          .connectorProvider !==
        CONNECTOR_CONFIGURATIONS.webcrawler.connectorProvider
    )
    .map(
      (key) =>
        CONNECTOR_CONFIGURATIONS[key as keyof typeof CONNECTOR_CONFIGURATIONS]
          .connectorProvider
    );
}

type ComparableByProvider = { connectorProvider: ConnectorProvider | null };
function compareByImportance(
  a: ComparableByProvider,
  b: ComparableByProvider
): number {
  const aConnector = a.connectorProvider;
  const bConnector = b.connectorProvider;

  const order = getConnectorOrder();

  // Handle null cases.
  if (aConnector === null) {
    return bConnector === null ? 0 : 1;
  }
  if (bConnector === null) {
    return -1;
  }

  // Handle webcrawler cases.
  if (aConnector === "webcrawler") {
    return 1;
  }
  if (bConnector === "webcrawler") {
    return -1;
  }

  // Get indices in sorted connectors.
  const indexA = order.indexOf(aConnector);
  const indexB = order.indexOf(bConnector);

  // If both are not found, they are considered equal.
  if (indexA === -1 && indexB === -1) {
    return 0;
  }

  // Compare indices, treating not found as less important.
  return (
    (indexA === -1 ? order.length : indexA) -
    (indexB === -1 ? order.length : indexB)
  );
}

// Order in the following format : connectorProvider > empty > webcrawler
export function orderDatasourceByImportance<Type extends ComparableByProvider>(
  dataSources: Type[]
) {
  return dataSources.sort(compareByImportance);
}

export function orderDatasourceViewByImportance<
  Type extends { dataSource: ComparableByProvider },
>(dataSourceViews: Type[]) {
  return dataSourceViews.sort((a, b) => {
    return compareByImportance(a.dataSource, b.dataSource);
  });
}

export function orderDatasourceViewSelectionConfigurationByImportance<
  Type extends { dataSourceView: { dataSource: ComparableByProvider } },
>(dataSourceViews: Type[]) {
  return dataSourceViews.sort((a, b) => {
    return compareByImportance(
      a.dataSourceView.dataSource,
      b.dataSourceView.dataSource
    );
  });
}
