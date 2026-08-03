import {
  isModelTierOverrideGroupKind,
  MODEL_TIER_OVERRIDE_GROUP_KINDS,
} from "@app/lib/model_tiers/group_kinds";
import { describe, expect, it } from "vitest";

describe("model tier override group kinds", () => {
  it("only allows provisioned and manual groups to carry overrides", () => {
    expect(MODEL_TIER_OVERRIDE_GROUP_KINDS).toEqual([
      "provisioned",
      "regular_manual",
    ]);
    expect(isModelTierOverrideGroupKind("provisioned")).toBe(true);
    expect(isModelTierOverrideGroupKind("regular_manual")).toBe(true);
    expect(isModelTierOverrideGroupKind("regular_auto")).toBe(false);
    expect(isModelTierOverrideGroupKind("global")).toBe(false);
    expect(isModelTierOverrideGroupKind("system")).toBe(false);
  });
});
