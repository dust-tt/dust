import {
  isModelTierAdministrationEnabled,
  ModelsPage,
} from "@app/components/pages/workspace/ModelsPage";
import { CREDIT_PRICED_BUSINESS_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { LightPlanFactory } from "@app/tests/utils/LightPlanFactory";
import { LightSubscriptionFactory } from "@app/tests/utils/LightSubscriptionFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build({ role: "admin" });
const creditPricedSubscription = LightSubscriptionFactory.build({
  plan: LightPlanFactory.build({ code: CREDIT_PRICED_BUSINESS_PLAN_CODE }),
});
const legacySubscription = LightSubscriptionFactory.build({
  plan: LightPlanFactory.build({ code: "PRO_PLAN_SEAT_29" }),
});

let subscription = creditPricedSubscription;

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ subscription }),
  useWorkspace: () => owner,
  useFeatureFlags: () => ({
    featureFlags: [],
    hasFeature: () => false,
  }),
}));

vi.mock("@app/hooks/useAdminPageTab", () => ({
  useAdminPageTab: () => ({
    tab: "providers",
    setTab: vi.fn(),
  }),
}));

vi.mock("@app/hooks/useProvidersSelection", () => ({
  useProvidersSelection: () => ({
    providersSelection: {},
    toggleProvider: vi.fn(),
    selectAllProviders: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/workspaces", () => ({
  useWorkspace: () => ({
    workspace: owner,
    isWorkspaceValidating: false,
    mutateWorkspace: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/groups", () => ({
  useGroups: () => ({ groups: [] }),
}));

vi.mock("@app/lib/swr/memberships", () => ({
  useMembersUsage: () => ({
    membersUsage: [],
    isMembersUsageLoading: false,
    isMembersUsageRefreshing: false,
    totalMembersUsage: 0,
  }),
}));

vi.mock("@app/lib/swr/model_tiers", () => ({
  useModelTiers: () => ({ tiers: [] }),
  useUserAllowedModelTiers: () => ({ users: [] }),
  useGroupAllowedModelTiers: () => ({ groups: [] }),
  useWorkspaceAllowedModelTiers: () => ({ maxTierName: null }),
  useUserAllowedModelTierMutations: () => ({
    setUserAllowedModelTier: vi.fn(),
    clearUserAllowedModelTier: vi.fn(),
  }),
}));

vi.mock(
  "@app/components/pages/workspace/model_providers/ModelProvidersPageContent",
  () => ({
    ModelProvidersPageContent: () => <div>Providers content</div>,
  })
);

vi.mock("@app/components/workspace/usage/ModelTiersSettingsCard", () => ({
  ModelTiersSettingsCard: () => <div>Model tiers settings</div>,
}));

vi.mock("@app/components/workspace/UsageMembersSection", () => ({
  UsageMembersSection: () => <div>Members section</div>,
}));

vi.mock("@app/components/workspace/GroupsUsageTable", () => ({
  GroupsUsageTable: () => <div>Groups table</div>,
}));

vi.mock("@app/components/pages/workspace/developers/ProvidersPage", () => ({
  Providers: () => <div>App credentials</div>,
}));

describe("isModelTierAdministrationEnabled", () => {
  it("is enabled for credit-priced plans", () => {
    expect(
      isModelTierAdministrationEnabled(
        LightPlanFactory.build({ code: CREDIT_PRICED_BUSINESS_PLAN_CODE })
      )
    ).toBe(true);
  });

  it("is disabled for non-credit-priced plans", () => {
    expect(
      isModelTierAdministrationEnabled(
        LightPlanFactory.build({ code: "PRO_PLAN_SEAT_29" })
      )
    ).toBe(false);
  });
});

describe("ModelsPage", () => {
  beforeEach(() => {
    subscription = creditPricedSubscription;
  });

  it("shows model-tier admin tabs on credit-priced plans", () => {
    render(<ModelsPage />);

    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Providers content")).toBeInTheDocument();
  });

  it("hides model-tier admin tabs on non-credit-priced plans and keeps providers", () => {
    subscription = legacySubscription;
    render(<ModelsPage />);

    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText("Providers content")).toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Model tiers settings")).not.toBeInTheDocument();
  });
});
