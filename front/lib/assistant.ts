import type {
  AgentUsageType,
  DataSourceType,
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

export function getSupportedModelConfig(supportedModel: SupportedModel) {
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
  GPT4 = "gpt-4",
  GPT35_TURBO = "gpt-3.5-turbo",
  CLAUDE = "claude-2",
  CLAUDE_INSTANT = "claude-instant-1",
  MISTRAL_MEDIUM = "mistral-medium",
  //!\ TEMPORARY WORKAROUND: Renaming 'mistral' to 'mistral-small' is not feasible since
  // it interferes with the retrieval of ongoing conversations involving this agent.
  // Needed to preserve ongoing chat integrity due to 'sId=mistral' references in legacy messages.
  MISTRAL_SMALL = "mistral",
  GEMINI_PRO = "gemini-pro",
}

const CUSTOM_ORDER: string[] = [
  GLOBAL_AGENTS_SID.DUST,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.CLAUDE,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
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
  if (a.sId === GLOBAL_AGENTS_SID.DUST) return -1;
  if (b.sId === GLOBAL_AGENTS_SID.DUST) return 1;

  // Check for 'gpt4'
  if (a.sId === GLOBAL_AGENTS_SID.GPT4) return -1;
  if (b.sId === GLOBAL_AGENTS_SID.GPT4) return 1;

  // Check for agents with non-global 'scope'
  if (a.scope !== "global" && b.scope === "global") return -1;
  if (b.scope !== "global" && a.scope === "global") return 1;

  // Check for customOrder (slack, notion, googledrive, github, claude)
  const aIndex = CUSTOM_ORDER.indexOf(a.sId);
  const bIndex = CUSTOM_ORDER.indexOf(b.sId);

  if (aIndex !== -1 && bIndex !== -1) {
    return aIndex - bIndex; // Both are in customOrder, sort them accordingly
  }

  if (aIndex !== -1) return -1; // Only a is in customOrder, it comes first
  if (bIndex !== -1) return 1; // Only b is in customOrder, it comes first

  return 0; // Default: keep the original order
}

export function assistantUsageMessage({
  assistantName,
  usage,
  isLoading,
  isError,
  shortVersion,
}: {
  assistantName: string;
  usage: AgentUsageType | null;
  isLoading: boolean;
  isError: boolean;
  shortVersion?: boolean;
}) {
  if (isError) {
    return "Error loading usage data.";
  } else if (isLoading) {
    return "Loading usage data...";
  } else if (usage) {
    if (shortVersion) {
      return `${usage.messageCount} message(s) over the last ${
        usage.timePeriodSec / (60 * 60 * 24)
      } days`;
    }
    return `@${assistantName} has been used by ${usage.userCount} ${
      usage.userCount > 1 ? "people" : "person"
    } in ${usage.messageCount} message${
      usage.messageCount > 1 ? "s" : ""
    } over the last ${usage.timePeriodSec / (60 * 60 * 24)} days.`;
  }
}

// Order in the following format : connectorProvider > empty > webcrawler
export function orderDatasourceByImportance(dataSources: DataSourceType[]) {
  return dataSources.sort((a, b) => {
    const aConnector = a.connectorProvider;
    const bConnector = b.connectorProvider;

    const order = Object.keys(CONNECTOR_CONFIGURATIONS)
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

    if (aConnector === CONNECTOR_CONFIGURATIONS.webcrawler.connectorProvider) {
      return 1;
    }

    if (bConnector === CONNECTOR_CONFIGURATIONS.webcrawler.connectorProvider) {
      return -1;
    }

    const indexA = aConnector ? order.indexOf(aConnector) : order.length;
    const indexB = bConnector ? order.indexOf(bConnector) : order.length;

    if (indexA === -1 && indexB === -1) {
      return 0;
    }

    return indexA - indexB;
  });
}
