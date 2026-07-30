import {
  computeTokensCostForUsageInMicroUsd,
  MODEL_PRICING,
} from "@app/lib/api/assistant/token_pricing";
import { awuFromMicroUsd } from "@app/lib/metronome/events";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";

export interface PublicModelCredit {
  modelId: string;
  displayName: string;
  modelMaker: ModelMakerIdType;
  modelMakerDisplayName: string;
  inputCreditsPerMTokens: number;
  outputCreditsPerMTokens: number;
}

const ONE_MILLION_TOKENS = 1_000_000;

// Some models (e.g. Grok 4.5) have a higher-priced long-context tier past a
// prompt token threshold. Pricing a single token keeps every model on its
// base tier, so the displayed rate is the flat per-million-token price
// rather than the blended rate of one huge long-context request.
const SINGLE_TOKEN = 1;

// Provider ids that are internal routing/no-op concepts rather than actual,
// separately priced models — not relevant on a public per-model credits page.
const EXCLUDED_PROVIDER_IDS = new Set([
  "noop",
  "auto",
  "auto_fast",
  "auto_complex",
]);

export function buildPublicModelCredits(): PublicModelCredit[] {
  const rows: PublicModelCredit[] = [];

  for (const model of SUPPORTED_MODEL_CONFIGS) {
    if (EXCLUDED_PROVIDER_IDS.has(model.providerId)) {
      continue;
    }

    // Skip models without an explicit pricing entry rather than silently
    // falling back to computeTokensCostForUsageInMicroUsd's default pricing.
    if (!(model.modelId in MODEL_PRICING)) {
      continue;
    }

    const inputCostMicroUsd =
      computeTokensCostForUsageInMicroUsd({
        modelId: model.modelId,
        promptTokens: SINGLE_TOKEN,
        completionTokens: 0,
        cachedTokens: null,
      }) * ONE_MILLION_TOKENS;
    const outputCostMicroUsd =
      computeTokensCostForUsageInMicroUsd({
        modelId: model.modelId,
        promptTokens: 0,
        completionTokens: SINGLE_TOKEN,
        cachedTokens: null,
      }) * ONE_MILLION_TOKENS;

    const modelMaker = getModelMaker(model);
    rows.push({
      modelId: model.modelId,
      displayName: model.displayName,
      modelMaker,
      modelMakerDisplayName: getModelMakerDisplayName(modelMaker),
      inputCreditsPerMTokens: awuFromMicroUsd(inputCostMicroUsd),
      outputCreditsPerMTokens: awuFromMicroUsd(outputCostMicroUsd),
    });
  }

  return rows;
}
