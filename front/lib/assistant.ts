import { ExtractSpecificKeys } from "@app/lib/api/typescipt_utils";
import { AgentConfigurationType } from "@app/types/assistant/agent";

/**
 * Supported models
 */

export const GPT_4_32K_MODEL_ID = "gpt-4-32k" as const;
export const GPT_4_MODEL_ID = "gpt-4" as const;

export const GPT_4_DEFAULT_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4_32K_MODEL_ID,
  displayName: "GPT 4",
  contextSize: 32768,
  largeModel: true,
  recommendedTopK: 32,
} as const;

export const GPT_4_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4_MODEL_ID,
  displayName: "GPT 4",
  contextSize: 8192,
  largeModel: true,
  recommendedTopK: 16,
};

export const GPT_3_5_TURBO_DEFAULT_MODEL_CONFIG = {
  providerId: "openai",
  modelId: "gpt-3.5-turbo-16k",
  displayName: "GPT 3.5 Turbo",
  contextSize: 16384,
  largeModel: false,
  recommendedTopK: 16,
} as const;

export const CLAUDE_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: "claude-2",
  displayName: "Claude 2",
  contextSize: 100000,
  largeModel: true,
  recommendedTopK: 32,
} as const;

export const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: "claude-instant-1.2",
  displayName: "Claude Instant 1.2",
  contextSize: 100000,
  largeModel: false,
  recommendedTopK: 32,
} as const;

export const MISTRAL_7B_DEFAULT_MODEL_CONFIG = {
  providerId: "textsynth",
  modelId: "mistral_7B_instruct",
  displayName: "Mistral 7B",
  contextSize: 4096,
  largeModel: false,
  recommendedTopK: 8,
} as const;

export const SUPPORTED_MODEL_CONFIGS = [
  GPT_3_5_TURBO_DEFAULT_MODEL_CONFIG,
  GPT_4_DEFAULT_MODEL_CONFIG,
  GPT_4_MODEL_CONFIG,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  MISTRAL_7B_DEFAULT_MODEL_CONFIG,
] as const;

// this creates a union type of all the {providerId: string, modelId: string}
// pairs that are in SUPPORTED_MODELS
export type SupportedModel = ExtractSpecificKeys<
  (typeof SUPPORTED_MODEL_CONFIGS)[number],
  "providerId" | "modelId"
>;

export function isSupportedModel(model: unknown): model is SupportedModel {
  const maybeSupportedModel = model as SupportedModel;
  return SUPPORTED_MODEL_CONFIGS.some(
    (m) =>
      m.modelId === maybeSupportedModel.modelId &&
      m.providerId === maybeSupportedModel.providerId
  );
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
  GPT4 = "gpt-4",
  GPT35_TURBO = "gpt-3.5-turbo",
  CLAUDE = "claude-2",
  CLAUDE_INSTANT = "claude-instant-1",
  MISTRAL = "mistral",
}

const CUSTOM_ORDER: string[] = [
  GLOBAL_AGENTS_SID.HELPER,
  GLOBAL_AGENTS_SID.DUST,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.CLAUDE,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.MISTRAL,
];

// This function implements our general strategy to sort agents to users (input bar, assistant list,
// agent suggestions...).
export function compareAgentsForSort(
  a: AgentConfigurationType,
  b: AgentConfigurationType
) {
  // Check for 'helper'
  if (a.sId === GLOBAL_AGENTS_SID.HELPER) return -1;
  if (b.sId === GLOBAL_AGENTS_SID.HELPER) return 1;

  // Check for 'dust'
  if (a.sId === GLOBAL_AGENTS_SID.DUST) return -1;
  if (b.sId === GLOBAL_AGENTS_SID.DUST) return 1;

  // Check for 'gpt4'
  if (a.sId === GLOBAL_AGENTS_SID.GPT4) return -1;
  if (b.sId === GLOBAL_AGENTS_SID.GPT4) return 1;

  // Check for agents with 'scope' set to 'workspace'
  if (a.scope === "workspace" && b.scope !== "workspace") return -1;
  if (b.scope === "workspace" && a.scope !== "workspace") return 1;

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
