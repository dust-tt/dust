import {
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import {
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_2_5_PRO_MODEL_CONFIG,
} from "@app/types/assistant/models/google_ai_studio";
import {
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@app/types/assistant/models/mistral";
import SUPPORTED_MODEL_CONFIGS from "@app/types/assistant/models/models";
import {
  GPT_4_1_MINI_MODEL_CONFIG,
  GPT_5_MODEL_CONFIG,
  O4_MINI_MODEL_ID,
} from "@app/types/assistant/models/openai";
import { isProviderWhitelisted } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelIdType,
  SupportedModel,
} from "@app/types/assistant/models/types";
import {
  GROK_4_FAST_NON_REASONING_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
} from "@app/types/assistant/models/xai";

import type { WorkspaceType } from "../user";
import type { LightAgentConfigurationType } from "./agent";

export function getSmallWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4_1_MINI_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_2_5_FLASH_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "xai")) {
    return GROK_4_FAST_NON_REASONING_MODEL_CONFIG;
  }
  return null;
}

export function getLargeNonAnthropicWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_5_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_2_5_PRO_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "xai")) {
    return GROK_4_MODEL_CONFIG;
  }
  return null;
}

export function getLargeWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG;
  }
  return getLargeNonAnthropicWhitelistedModel(owner);
}

export const DEFAULT_REASONING_MODEL_ID = O4_MINI_MODEL_ID;

export const DEFAULT_TOKEN_COUNT_ADJUSTMENT = 1.15;

export function isSupportedModel(model: unknown): model is SupportedModel {
  const maybeSupportedModel = model as SupportedModel;
  return SUPPORTED_MODEL_CONFIGS.some(
    (m) =>
      m.modelId === maybeSupportedModel.modelId &&
      m.providerId === maybeSupportedModel.providerId
  );
}

export function isSupportingResponseFormat(modelId: ModelIdType) {
  const model = SUPPORTED_MODEL_CONFIGS.find(
    (config) => config.modelId === modelId
  );
  return model?.supportsResponseFormat;
}

/**
 * Global agent list (stored here to be imported from client-side)
 */

export enum GLOBAL_AGENTS_SID {
  HELPER = "helper",
  DUST = "dust",
  DEEP_DIVE = "deep-dive",
  DUST_TASK = "dust-task",
  DUST_BROWSER_SUMMARY = "dust-browser-summary",
  DUST_PLANNING = "dust-planning",
  SLACK = "slack",
  GOOGLE_DRIVE = "google_drive",
  NOTION = "notion",
  GITHUB = "github",
  INTERCOM = "intercom",
  GPT35_TURBO = "gpt-3.5-turbo",
  GPT4 = "gpt-4",
  GPT5 = "gpt-5",
  GPT5_THINKING = "gpt-5-thinking",
  GPT5_NANO = "gpt-5-nano",
  GPT5_MINI = "gpt-5-mini",
  O1 = "o1",
  O1_MINI = "o1-mini",
  O1_HIGH_REASONING = "o1_high",
  O3_MINI = "o3-mini",
  O3 = "o3",
  CLAUDE_4_5_HAIKU = "claude-4.5-haiku",
  CLAUDE_4_5_SONNET = "claude-4.5-sonnet",
  CLAUDE_4_SONNET = "claude-4-sonnet",
  CLAUDE_3_OPUS = "claude-3-opus",
  CLAUDE_3_SONNET = "claude-3-sonnet",
  CLAUDE_3_HAIKU = "claude-3-haiku",
  CLAUDE_3_7_SONNET = "claude-3-7-sonnet",
  CLAUDE_2 = "claude-2",
  CLAUDE_INSTANT = "claude-instant-1",
  MISTRAL_LARGE = "mistral-large",
  MISTRAL_MEDIUM = "mistral-medium",
  //!\ TEMPORARY WORKAROUND: Renaming 'mistral' to 'mistral-small' is not feasible since
  // it interferes with the retrieval of ongoing conversations involving this agent.
  // Needed to preserve ongoing chat integrity due to 'sId=mistral' references in legacy messages.
  MISTRAL_SMALL = "mistral",
  GEMINI_PRO = "gemini-pro",
  DEEPSEEK_R1 = "deepseek-r1",

  NOOP = "noop",
}

export function isGlobalAgentId(sId: string): sId is GLOBAL_AGENTS_SID {
  return (Object.values(GLOBAL_AGENTS_SID) as string[]).includes(sId);
}

export function getGlobalAgentAuthorName(agentId: string): string {
  switch (agentId) {
    case GLOBAL_AGENTS_SID.GPT4:
    case GLOBAL_AGENTS_SID.GPT5:
    case GLOBAL_AGENTS_SID.GPT5_THINKING:
    case GLOBAL_AGENTS_SID.GPT5_NANO:
    case GLOBAL_AGENTS_SID.GPT5_MINI:
    case GLOBAL_AGENTS_SID.O1:
    case GLOBAL_AGENTS_SID.O1_MINI:
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
    case GLOBAL_AGENTS_SID.O3_MINI:
    case GLOBAL_AGENTS_SID.O3:
      return "OpenAI";
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      return "Anthropic";
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return "Mistral";
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      return "Google";
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      return "DeepSeek";
    case GLOBAL_AGENTS_SID.NOOP:
      return "Noop";
    default:
      return "Dust";
  }
}

const CUSTOM_ORDER: string[] = [
  GLOBAL_AGENTS_SID.DUST,
  GLOBAL_AGENTS_SID.DEEP_DIVE,
  GLOBAL_AGENTS_SID.CLAUDE_4_SONNET,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.O3_MINI,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.O3,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.MISTRAL_LARGE,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.GEMINI_PRO,
  GLOBAL_AGENTS_SID.HELPER,
  GLOBAL_AGENTS_SID.NOOP,
];

// This function implements our general strategy to sort agents to users (input bar, agent list,
// agent suggestions...).
export function compareAgentsForSort(
  a: LightAgentConfigurationType,
  b: LightAgentConfigurationType
) {
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }

  if (a.sId === GLOBAL_AGENTS_SID.DUST) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.DUST) {
    return 1;
  }

  if (a.sId === GLOBAL_AGENTS_SID.DEEP_DIVE) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.DEEP_DIVE) {
    return 1;
  }

  if (a.sId === GLOBAL_AGENTS_SID.GPT5) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.GPT5) {
    return 1;
  }

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

  // default: sort alphabetically
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}
