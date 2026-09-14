import type { ModelTierId } from "@app/components/model_picker/modelPickerUtils";
import { BarFull, BarHalf, BarLow } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export const MODEL_TIER_ICON: Record<ModelTierId, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};
