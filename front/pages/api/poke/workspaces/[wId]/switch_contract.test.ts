import { Authenticator } from "@app/lib/auth";
import {
  createMetronomeContract,
  listMetronomeContracts,
  listMetronomePackages,
} from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  switchMetronomeContractPackage,
} from "@app/lib/metronome/contracts";
import { PlanModel } from "@app/lib/models/plan";
import {
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { getStripeCustomer } from "@app/lib/plans/stripe";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./switch_contract";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    listMetronomePackages: vi.fn(),
    createMetronomeContract: vi.fn(),
    listMetronomeContracts: vi.fn(),
    scheduleMetronomeContractEnd: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/contracts", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/contracts")
  >("@app/lib/metronome/contracts");
  return {
    ...actual,
    ensureMetronomeCustomerForWorkspace: vi.fn(),
    switchMetronomeContractPackage: vi.fn(),
  };
});

vi.mock("@app/lib/api/subscription", () => ({
  restoreWorkspaceAfterSubscription: vi.fn(),
}));

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
    planCode: PRO_PLAN_SEAT_39_CODE,
    metronomePackageId: BUSINESS_PACKAGE_ID,
    stripeCustomerId: STRIPE_CUSTOMER_ID,
    ...overrides,
  };
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
        aliases: ["legacy-enterprise"],
        tier: "enterprise",
      },
      {
        id: PRO_PACKAGE_ID,
        name: "Pro USD",
        aliases: ["legacy-pro-monthly"],
        tier: "pro",
      },
      {
        id: BUSINESS_PACKAGE_ID,
        name: "Business USD",
        aliases: ["legacy-business"],
        tier: "business",
      },
    ])
  );
  vi.mocked(createMetronomeContract).mockResolvedValue(
    new Ok({ contractId: NEW_CONTRACT_ID })
  );
  vi.mocked(listMetronomeContracts).mockResolvedValue(new Ok([]));
  vi.mocked(switchMetronomeContractPackage).mockResolvedValue(
    new Ok({ metronomeContractId: NEW_CONTRACT_ID })
  );
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — Enterprise", () => {
  it("creates a future-scheduled contract and leaves the subscription untouched", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(createMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        packageId: ENT_PACKAGE_ID,
        planCode: ENT_PLAN_CODE,
      })
    );

    // Subscription DB record is unchanged: still points at the old contract.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sub = adminAuth.subscriptionResource();
    expect(sub!.metronomeContractId).toBe(EXISTING_CONTRACT_ID);
  });

  it("rejects when startingAt is missing", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ startingAt: undefined });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "startingAt is required"
    );
  });

  it("rejects when startingAt is less than 1h in the future", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ startingAt: futureIso(0.5) });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("at least one hour");
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — Pro / Business", () => {
  it("switches Pro contract at current hour and sync-flips the DB", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(switchMetronomeContractPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        oldContractId: EXISTING_CONTRACT_ID,
        packageAlias: "legacy-pro-monthly",
        planCode: PRO_PLAN_SEAT_29_CODE,
        swapAt: "current-hour",
      })
    );

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sub = adminAuth.subscriptionResource();
    expect(sub!.metronomeContractId).toBe(NEW_CONTRACT_ID);
    expect(sub!.getPlan().code).toBe(PRO_PLAN_SEAT_29_CODE);
  });

  it("switches Business contract at current hour and sync-flips the DB", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(switchMetronomeContractPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "legacy-business",
        planCode: PRO_PLAN_SEAT_39_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("rejects when startingAt is provided", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody({ startingAt: futureIso(2) });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("not supported");
  });

  it("rejects when workspace has no current Metronome contract (fresh-Metronome path)", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    // metronome_billing flag + no Stripe sub bypasses the Metronome-only-billed
    // eligibility check; ends up in the handler with no contract to switch.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(adminAuth, "metronome_billing");

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "no current Metronome contract"
    );
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — guards", () => {
  it("rejects when plan tier doesn't match package tier", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    // Pro plan code with an Enterprise package.
    req.body = proBody({ metronomePackageId: ENT_PACKAGE_ID });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("does not match");
  });

  it("rejects when target plan is free", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody({ planCode: "FREE_UPGRADED_PLAN" });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("free plan");
  });

  it("rejects when the workspace is Stripe-billed", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID, {
      stripeSubscriptionId: "sub_stripe_xxx",
    });

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("Metronome-billed");
  });

  it("rejects when the selected package has no known alias (tier=null)", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    vi.mocked(listMetronomePackages).mockResolvedValueOnce(
      new Ok([
        {
          id: ENT_PACKAGE_ID,
          name: "Unknown Pkg",
          aliases: ["some-bespoke-alias"],
          tier: null,
        },
      ])
    );

    req.body = enterpriseBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("no known alias");
  });
});
