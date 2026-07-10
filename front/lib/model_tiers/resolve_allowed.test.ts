import { resolveAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import { describe, expect, it } from "vitest";

describe("resolveAllowedModelTiers", () => {
  it("uses workspace tiers when no overrides exist", () => {
    const result = resolveAllowedModelTiers({
      workspaceAllowedTierNames: ["cost_efficient", "balanced"],
      groupAllowedTierNamesList: [[], []],
      userAllowedTierNames: [],
    });

    expect(result.tiers).toEqual(["cost_efficient", "balanced"]);
    expect(result.source).toBe("workspace");
  });

  it("uses the max group tier across groups, overriding workspace", () => {
    const result = resolveAllowedModelTiers({
      workspaceAllowedTierNames: ["cost_efficient"],
      groupAllowedTierNamesList: [
        ["cost_efficient", "balanced"],
        ["cost_efficient", "balanced", "premium"],
      ],
      userAllowedTierNames: [],
    });

    expect(result.tiers).toEqual(["cost_efficient", "balanced", "premium"]);
    expect(result.source).toBe("groups");
  });

  it("uses user tier override over groups and workspace", () => {
    const result = resolveAllowedModelTiers({
      workspaceAllowedTierNames: ["cost_efficient", "balanced", "premium"],
      groupAllowedTierNamesList: [["cost_efficient", "balanced", "premium"]],
      userAllowedTierNames: ["cost_efficient"],
    });

    expect(result.tiers).toEqual(["cost_efficient"]);
    expect(result.source).toBe("user");
  });

  it("treats workspace grants on the global group as workspace, not groups", () => {
    const result = resolveAllowedModelTiers({
      workspaceAllowedTierNames: ["cost_efficient", "balanced"],
      // Callers must exclude global-group grants from the group override layer.
      groupAllowedTierNamesList: [[]],
      userAllowedTierNames: [],
    });

    expect(result.tiers).toEqual(["cost_efficient", "balanced"]);
    expect(result.source).toBe("workspace");
  });
});
