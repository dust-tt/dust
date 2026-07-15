import {
  isModelTierOverrideGroupKind,
  MODEL_TIER_OVERRIDE_GROUP_KINDS,
} from "@app/lib/model_tiers/group_kinds";
import { describe, expect, it } from "vitest";

describe("model tier override group kinds", () => {
  it("only allows regular_auto and provisioned groups to carry overrides", () => {
    expect(MODEL_TIER_OVERRIDE_GROUP_KINDS).toEqual([
      "regular_auto",
      "provisioned",
    ]);
    expect(isModelTierOverrideGroupKind("regular_auto")).toBe(true);
    expect(isModelTierOverrideGroupKind("provisioned")).toBe(true);
    expect(isModelTierOverrideGroupKind("global")).toBe(false);
    expect(isModelTierOverrideGroupKind("system")).toBe(false);
  });
});
