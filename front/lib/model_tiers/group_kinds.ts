import type { GroupKind } from "@app/types/groups";

// Groups that can carry a model-tier override grant via setGroupMaxAllowedTier.
export const MODEL_TIER_OVERRIDE_GROUP_KINDS = [
  "regular_auto",
  "provisioned",
] as const satisfies readonly GroupKind[];

export type ModelTierOverrideGroupKind =
  (typeof MODEL_TIER_OVERRIDE_GROUP_KINDS)[number];

export function isModelTierOverrideGroupKind(
  kind: GroupKind
): kind is ModelTierOverrideGroupKind {
  return MODEL_TIER_OVERRIDE_GROUP_KINDS.some(
    (allowedKind) => allowedKind === kind
  );
}
