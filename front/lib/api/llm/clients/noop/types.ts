import type { ModelIdType } from "@app/types";
import { NOOP_MODEL_ID } from "@app/types";

const NOOP_WHITELISTED_MODEL_IDS = [NOOP_MODEL_ID] as const;

type NoopWhitelistedModelId =
  (typeof NOOP_WHITELISTED_MODEL_IDS)[number];

export function isNoopWhitelistedModelId(
  modelId: ModelIdType
): modelId is NoopWhitelistedModelId {
  return new Set<string>(NOOP_WHITELISTED_MODEL_IDS).has(modelId);
}
