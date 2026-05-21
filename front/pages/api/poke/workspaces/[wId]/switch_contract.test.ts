import { Authenticator } from "@app/lib/auth";
import { listMetronomePackages } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import {
  clearMetronomePaygCapAlert,
  syncMetronomePaygCapAlert,
} from "@app/lib/metronome/payg_alerts";
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
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
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

vi.mock("@app/lib/metronome/payg_alerts", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/payg_alerts")
  >("@app/lib/metronome/payg_alerts");
  return {
    ...actual,
    syncMetronomePaygCapAlert: vi.fn(),
    clearMetronomePaygCapAlert: vi.fn(),
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
  vi.mocked(syncMetronomePaygCapAlert).mockResolvedValue(
    new Ok({ alertId: "alert_test" })
  );
  vi.mocked(clearMetronomePaygCapAlert).mockResolvedValue(new Ok(undefined));
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — Enterprise", () => {
  it("provisions a future-scheduled contract and leaves the DB subscription for contract.start", async () => {
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

  it("rejects when the package currency does not match the Stripe customer currency", async () => {
    await ensureEnterprisePlan();
    vi.mocked(getStripeCustomer).mockResolvedValue({
      id: STRIPE_CUSTOMER_ID,
      address: { country: "FR" },
    } as unknown as Stripe.Customer);

    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("resolves to EUR");
    expect(res._getJSONData().error.message).toContain("Pick a EUR package");
    expect(provisionMetronomeContract).not.toHaveBeenCalled();
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — Pro / Business", () => {
  it("provisions a Pro contract at the current hour and leaves the DB subscription for contract.start", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
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
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "business",
        planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("accepts startingAt and schedules at the next hour boundary", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody({ startingAt: futureIso(2) });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "legacy-pro-monthly",
        swapAt: "next-hour",
      })
    );
  });

  it("provisions the first Pro contract when the workspace has no current Metronome contract", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    // No Stripe sub + no Metronome contract: with Metronome billing enabled
    // by default, the workspace is eligible for a fresh Metronome contract.

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "legacy-pro-monthly",
        planCode: PRO_PLAN_SEAT_29_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("stages a created_backend_only subscription for contract.start to activate", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

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
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    // First schedule → pending P1.
    req.body = proBody();
    req.query.wId = workspace.sId;
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

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
    const { req: req2, res: res2 } = createMocks<
      NextApiRequest,
      NextApiResponse
    >({
      method: "POST",
      query: { wId: workspace.sId },
      headers: {},
    });
    req2.body = businessBody();
    await handler(req2, res2);
    expect(res2._getStatusCode()).toBe(200);

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
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — PAYG", () => {
  it("persists paygCapMicroUsd and syncs the Metronome alert when switching to enterprise with PAYG enabled", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ paygEnabled: true, paygCapDollars: 500 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(
        adminAuth
      );
    expect(config?.paygCapMicroUsd).toBe(500 * 1_000_000);

    expect(syncMetronomePaygCapAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        paygCapDollars: 500,
        workspaceSId: workspace.sId,
      })
    );
  });

  it("persists paygCapMicroUsd when switching to business with PAYG enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({ paygEnabled: true, paygCapDollars: 250 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

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
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody({ paygEnabled: true, paygCapDollars: 100 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "Pay-as-you-go can only be enabled"
    );
    expect(provisionMetronomeContract).not.toHaveBeenCalled();
  });

  it("rejects when paygEnabled is true but paygCapDollars is missing", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ paygEnabled: true });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("PAYG cap");
  });

  it("clears paygCapMicroUsd and archives the Metronome alert when paygEnabled is false", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
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

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(
        adminAuth
      );
    expect(config?.paygCapMicroUsd).toBeNull();

    expect(clearMetronomePaygCapAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        workspaceSId: workspace.sId,
      })
    );
  });
});
