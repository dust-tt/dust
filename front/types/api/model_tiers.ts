import { MODEL_TIERS, type ModelTier } from "@app/lib/api/models_picker/tiers";
import { z } from "zod";

export const ModelTierSchema = z.enum(MODEL_TIERS);

export type GetModelTierResponseBody = {
  tier: ModelTier | null;
};

export type SetModelTierRequestBody = {
  tier: ModelTier;
};

export type SetModelTierResponseBody = {
  tier: ModelTier;
};

export type ClearModelTierResponseBody = {
  cleared: boolean;
};

export type ListModelTierOverridesResponseBody = {
  tiers: Record<string, ModelTier>;
};
