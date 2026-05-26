import { Authenticator } from "@app/lib/auth";
import { listMetronomePackages } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { PlanModel } from "@app/lib/models/plan";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { getStripeCustomer } from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    listMetronomePackages: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/contracts", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/contracts")
  >("@app/lib/metronome/contracts");
  return {
    ...actual,
    ensureMetronomeCustomerForWorkspace: vi.fn(),
    provisionMetronomeContract: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/plan_type")
  >("@app/lib/metronome/plan_type");
  return {
    ...actual,
    invalidateContractCache: vi.fn(),
  };
});

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual<typeof import("@app/lib/plans/stripe")>(
    "@app/lib/plans/stripe"
  );
  return {
    ...actual,
    getStripeCustomer: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const EXISTING_CONTRACT_ID = "contract_existing_xxx";
const NEW_CONTRACT_ID = "contract_new_yyy";
const ENT_PACKAGE_ID = "pkg_ent_usd";
const PRO_PACKAGE_ID = "pkg_pro_usd";
const BUSINESS_PACKAGE_ID = "pkg_business_usd";
const ENT_PLAN_CODE = "ENT_TEST_PLAN";
const STRIPE_CUSTOMER_ID = "cus_test_xxx";

async function ensureEnterprisePlan(): Promise<void> {
  await PlanModel.upsert({
    code: ENT_PLAN_CODE,
    name: "Test Enterprise",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    maxImagesPerWeek: 1000,
    maxUsersInWorkspace: 1000,
    maxFreeUsersInWorkspace: -1,
    maxLifetimeFreeUsersInWorkspace: -1,
    maxVaultsInWorkspace: 100,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: true,
    isSSOAllowed: true,
    isSCIMAllowed: true,
    isAuditLogsAllowed: true,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 100,
    trialPeriodDays: 0,
    canUseProduct: true,
    isByok: false,
  });
}

async function makeSubscriptionMetronomeBilled(
  workspace: WorkspaceType,
  contractId: string | null,
  { stripeSubscriptionId = null }: { stripeSubscriptionId?: string | null } = {}
): Promise<void> {
  const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
    .id;
  await WorkspaceResource.updateMetronomeCustomerId(
    workspaceModelId,
    METRONOME_CUSTOMER_ID
  );
  const sub =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspaceModelId);
  if (!sub) {
    throw new Error("Test setup: workspace has no active subscription");
  }
  await sub.markAsEnded("ended");
  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId: workspaceModelId,
      planId: sub.planId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId,
      metronomeContractId: contractId,
    },
    sub.getPlan()
  );
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function enterpriseBody(overrides: Record<string, unknown> = {}) {
  return {
    planCode: ENT_PLAN_CODE,
    metronomePackageId: ENT_PACKAGE_ID,
    startingAt: futureIso(2),
    stripeCustomerId: STRIPE_CUSTOMER_ID,
    ...overrides,
  };
}

function proBody(overrides: Record<string, unknown> = {}) {
  return {
    planCode: PRO_PLAN_SEAT_29_CODE,
    metronomePackageId: PRO_PACKAGE_ID,
    stripeCustomerId: STRIPE_CUSTOMER_ID,
    ...overrides,
  };
}

function businessBody(overrides: Record<string, unknown> = {}) {
  return {
    planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    metronomePackageId: BUSINESS_PACKAGE_ID,
    stripeCustomerId: STRIPE_CUSTOMER_ID,
    ...overrides,
  };
}

function postSwitchContract(workspaceId: string, body: unknown) {
  return honoApp.request(
    `/api/poke/workspaces/${workspaceId}/switch_contract`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.mocked(ensureMetronomeCustomerForWorkspace).mockResolvedValue(
    new Ok({ metronomeCustomerId: METRONOME_CUSTOMER_ID })
  );
  vi.mocked(getStripeCustomer).mockResolvedValue({
    id: STRIPE_CUSTOMER_ID,
  } as unknown as Stripe.Customer);
  vi.mocked(listMetronomePackages).mockResolvedValue(
    new Ok([
      {
        id: ENT_PACKAGE_ID,
        name: "Enterprise USD",
        aliases: ["enterprise"],
        tier: "enterprise",
        currency: "usd",
      },
      {
        id: PRO_PACKAGE_ID,
        name: "Pro USD",
        aliases: ["legacy-pro-monthly"],
        tier: "pro",
        currency: "usd",
      },
      {
        id: BUSINESS_PACKAGE_ID,
        name: "Business USD",
        aliases: ["business"],
        tier: "business",
        currency: "usd",
      },
    ])
  );
  vi.mocked(provisionMetronomeContract).mockResolvedValue(
    new Ok({ metronomeContractId: NEW_CONTRACT_ID })
  );
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — Enterprise", () => {
  it("provisions a future-scheduled contract and leaves the DB subscription for contract.start", async () => {
    await ensureEnterprisePlan();
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(workspace.sId, enterpriseBody());

    expect(response.status).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        packageAlias: "enterprise",
        planCode: ENT_PLAN_CODE,
        swapAt: "next-hour",
      })
    );

    // DB subscription unchanged — the contract.start webhook will flip it.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sub = adminAuth.subscriptionResource();
    expect(sub!.metronomeContractId).toBe(EXISTING_CONTRACT_ID);
  });

  it("starts immediately when startingAt is omitted", async () => {
    await ensureEnterprisePlan();
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      enterpriseBody({ startingAt: undefined })
    );

    expect(response.status).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        packageAlias: "enterprise",
        planCode: ENT_PLAN_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("rejects when startingAt is less than 1h in the future", async () => {
    await ensureEnterprisePlan();
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      enterpriseBody({ startingAt: futureIso(0.5) })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("at least one hour");
  });

  it("rejects when the package currency does not match the Stripe customer currency", async () => {
    await ensureEnterprisePlan();
    vi.mocked(getStripeCustomer).mockResolvedValue({
      id: STRIPE_CUSTOMER_ID,
      address: { country: "FR" },
    } as unknown as Stripe.Customer);

    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(workspace.sId, enterpriseBody());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("resolves to EUR");
    expect(data.error.message).toContain("Pick a EUR package");
    expect(provisionMetronomeContract).not.toHaveBeenCalled();
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — Pro / Business", () => {
  it("provisions a Pro contract at the current hour and leaves the DB subscription for contract.start", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(workspace.sId, proBody());

    expect(response.status).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "legacy-pro-monthly",
        planCode: PRO_PLAN_SEAT_29_CODE,
        swapAt: "current-hour",
      })
    );

    // DB subscription unchanged — the contract.start webhook will flip it.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sub = adminAuth.subscriptionResource();
    expect(sub!.metronomeContractId).toBe(EXISTING_CONTRACT_ID);
  });

  it("provisions a Business contract at the current hour", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(workspace.sId, businessBody());

    expect(response.status).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "business",
        planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("accepts startingAt and schedules at the next hour boundary", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      proBody({ startingAt: futureIso(2) })
    );

    expect(response.status).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "legacy-pro-monthly",
        swapAt: "next-hour",
      })
    );
  });

  it("provisions the first Pro contract when the workspace has no current Metronome contract", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    // No Stripe sub + no Metronome contract: with Metronome billing enabled
    // by default, the workspace is eligible for a fresh Metronome contract.

    const response = await postSwitchContract(workspace.sId, proBody());

    expect(response.status).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "legacy-pro-monthly",
        planCode: PRO_PLAN_SEAT_29_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("stages a created_backend_only subscription for contract.start to activate", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(workspace.sId, proBody());

    expect(response.status).toBe(200);

    const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
      .id;
    const pending =
      await SubscriptionResource.fetchPendingByWorkspaceModelId(
        workspaceModelId
      );
    expect(pending).not.toBeNull();
    expect(pending!.status).toBe("created_backend_only");
    expect(pending!.metronomeContractId).toBe(NEW_CONTRACT_ID);
    expect(pending!.getPlan().code).toBe(PRO_PLAN_SEAT_29_CODE);
  });

  it("supersedes a prior pending subscription on a second schedule", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    // First schedule → pending P1.
    const firstResponse = await postSwitchContract(workspace.sId, proBody());
    expect(firstResponse.status).toBe(200);

    const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
      .id;
    const firstPending =
      await SubscriptionResource.fetchPendingByWorkspaceModelId(
        workspaceModelId
      );
    expect(firstPending).not.toBeNull();
    const firstPendingSId = firstPending!.sId;

    // Second schedule with a different (business) target → ends P1, creates P2.
    const SECOND_CONTRACT_ID = "contract_new_zzz";
    vi.mocked(provisionMetronomeContract).mockResolvedValueOnce(
      new Ok({ metronomeContractId: SECOND_CONTRACT_ID })
    );
    const secondResponse = await postSwitchContract(
      workspace.sId,
      businessBody()
    );
    expect(secondResponse.status).toBe(200);

    const secondPending =
      await SubscriptionResource.fetchPendingByWorkspaceModelId(
        workspaceModelId
      );
    expect(secondPending).not.toBeNull();
    expect(secondPending!.sId).not.toBe(firstPendingSId);
    expect(secondPending!.metronomeContractId).toBe(SECOND_CONTRACT_ID);
    expect(secondPending!.getPlan().code).toBe(
      CREDIT_PRICED_BUSINESS_PLAN_CODE
    );
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — guards", () => {
  it("rejects when plan tier doesn't match package tier", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    // Pro plan code with an Enterprise package.
    const response = await postSwitchContract(
      workspace.sId,
      proBody({ metronomePackageId: ENT_PACKAGE_ID })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("does not match");
  });

  it("rejects when target plan tier does not match the package tier (pro pkg, free plan)", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      proBody({ planCode: "FREE_UPGRADED_PLAN" })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("does not match");
  });

  it("rejects when the workspace is Stripe-billed", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID, {
      stripeSubscriptionId: "sub_stripe_xxx",
    });

    const response = await postSwitchContract(workspace.sId, proBody());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("Metronome-billed");
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — PAYG", () => {
  it("persists paygCapMicroUsd and syncs the Metronome alert when switching to enterprise with PAYG enabled", async () => {
    await ensureEnterprisePlan();
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      enterpriseBody({ paygEnabled: true, paygCapDollars: 500 })
    );

    expect(response.status).toBe(200);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(
        adminAuth
      );
    expect(config?.paygCapMicroUsd).toBe(500 * 1_000_000);
  });

  it("persists paygCapMicroUsd when switching to business with PAYG enabled", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      businessBody({ paygEnabled: true, paygCapDollars: 250 })
    );

    expect(response.status).toBe(200);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(
        adminAuth
      );
    expect(config?.paygCapMicroUsd).toBe(250 * 1_000_000);
  });

  it("rejects PAYG on a pro contract", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      proBody({ paygEnabled: true, paygCapDollars: 100 })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("Pay-as-you-go can only be enabled");
    expect(provisionMetronomeContract).not.toHaveBeenCalled();
  });

  it("rejects when paygEnabled is true but paygCapDollars is missing", async () => {
    await ensureEnterprisePlan();
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const response = await postSwitchContract(
      workspace.sId,
      enterpriseBody({ paygEnabled: true })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("PAYG cap");
  });

  it("clears paygCapMicroUsd when paygEnabled is false", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await ProgrammaticUsageConfigurationResource.makeNew(adminAuth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000 * 1_000_000,
      dailyCapMicroUsd: null,
    });

    const response = await postSwitchContract(workspace.sId, proBody());

    expect(response.status).toBe(200);

    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(
        adminAuth
      );
    expect(config?.paygCapMicroUsd).toBeNull();
  });
});
