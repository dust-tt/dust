import { useMembersModelTiers } from "@app/hooks/useMembersModelTiers";
import { getMaxTierName } from "@app/lib/model_tiers/tier_order";
import assert from "@app/lib/utils/assert";
import type { LightWorkspaceType } from "@app/types/user";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setUserAllowedModelTier, clearUserAllowedModelTier } = vi.hoisted(
  () => ({
    setUserAllowedModelTier: vi.fn(),
    clearUserAllowedModelTier: vi.fn(),
  })
);

vi.mock("@app/lib/swr/groups", () => ({
  useGroups: () => ({
    groups: [
      { sId: "grp_sales", name: "Sales" },
      { sId: "grp_eng", name: "Engineering" },
    ],
  }),
}));

vi.mock("@app/lib/swr/model_tiers", () => ({
  useUserAllowedModelTiers: () => ({
    users: [{ userId: "usr_override", maxTierName: "cost_efficient" }],
  }),
  useGroupAllowedModelTiers: () => ({
    groups: [{ groupId: "grp_sales", maxTierName: "balanced" }],
  }),
  useWorkspaceAllowedModelTiers: () => ({ maxTierName: "premium" }),
  useUserAllowedModelTierMutations: () => ({
    setUserAllowedModelTier,
    clearUserAllowedModelTier,
  }),
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

function renderMembersModelTiers() {
  return renderHook(() => useMembersModelTiers({ owner, disabled: false }))
    .result.current;
}

function getSubmenu(userId: string, groupNames: string[]) {
  const item = renderMembersModelTiers().getModelTierMenuItem(
    userId,
    groupNames
  );
  assert(item.kind === "submenu", "Expected a submenu item");
  return item;
}

describe("useMembersModelTiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives precedence to the user override", () => {
    const resolved = renderMembersModelTiers().getResolvedModelTiers(
      "usr_override",
      ["Sales"]
    );
    expect(resolved.source).toBe("user");
    expect(getMaxTierName(resolved.tiers)).toBe("cost_efficient");
  });

  it("falls back to the highest tier among the member's groups", () => {
    const resolved = renderMembersModelTiers().getResolvedModelTiers(
      "usr_member",
      ["Engineering", "Sales"]
    );
    expect(resolved.source).toBe("groups");
    expect(getMaxTierName(resolved.tiers)).toBe("balanced");
  });

  it("falls back to the workspace tier without group overrides", () => {
    const resolved = renderMembersModelTiers().getResolvedModelTiers(
      "usr_member",
      ["Engineering"]
    );
    expect(resolved.source).toBe("workspace");
    expect(getMaxTierName(resolved.tiers)).toBe("premium");
  });

  it("labels the inherit entry after where the tier comes from", () => {
    expect(getSubmenu("usr_member", ["Sales"]).items[0].name).toBe(
      "Inherited from groups"
    );
    expect(getSubmenu("usr_member", []).items[0].name).toBe(
      "Inherited from workspace"
    );
  });

  it("checks the current selection", () => {
    const checked = getSubmenu("usr_override", [])
      .items.filter((item) => item.checked)
      .map((item) => item.id);
    expect(checked).toEqual(["cost_efficient"]);
  });

  it("sets or clears the user override on select", () => {
    const submenu = getSubmenu("usr_member", []);

    submenu.onSelect("balanced");
    expect(setUserAllowedModelTier).toHaveBeenCalledWith({
      userId: "usr_member",
      tierName: "balanced",
    });

    submenu.onSelect("inherit");
    expect(clearUserAllowedModelTier).toHaveBeenCalledWith({
      userId: "usr_member",
    });
  });
});
