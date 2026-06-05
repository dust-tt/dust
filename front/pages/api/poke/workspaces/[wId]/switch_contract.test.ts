import { Authenticator } from "@app/lib/auth";
import {
  addPrepaidCommitToContract,
  getMetronomeContractById,
  listMetronomePackages,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import {
  applySeatRateOverrides,
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
  syncContractQuantities,
} from "@app/lib/metronome/contracts";
import { remapMembershipSeatTypesForContract } from "@app/lib/metronome/seats";
import { PlanModel } from "@app/lib/models/plan";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import {
  getStripeCustomer,
  scheduleSubscriptionCancellation,
} from "@app/lib/plans/stripe";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
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
    addPrepaidCommitToContract: vi.fn(),
    getMetronomeContractById: vi.fn(),
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
    applySeatRateOverrides: vi.fn(),
    syncContractQuantities: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/seats", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seats")
  >("@app/lib/metronome/seats");
  return {
    ...actual,
    remapMembershipSeatTypesForContract: vi.fn(),
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
    scheduleSubscriptionCancellation: vi.fn(),
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
        seats: [],
      },
      {
        id: PRO_PACKAGE_ID,
        name: "Pro USD",
        aliases: ["legacy-pro-monthly"],
        tier: "pro",
        currency: "usd",
        seats: [],
      },
      {
        id: BUSINESS_PACKAGE_ID,
        name: "Business USD",
        aliases: ["business"],
        tier: "business",
        currency: "usd",
        seats: [
          {
            seatType: "workspace",
            productId: "prod_workspace",
            productName: "Workspace seat",
            defaultRate: 4000,
            entitled: true,
          },
          {
            seatType: "max",
            productId: "prod_max",
            productName: "Max seat",
            defaultRate: null,
            entitled: false,
          },
          {
            seatType: "free",
            productId: "prod_free",
            productName: "Free seat",
            defaultRate: null,
            entitled: false,
          },
        ],
      },
    ])
  );
  vi.mocked(provisionMetronomeContract).mockResolvedValue(
    new Ok({ metronomeContractId: NEW_CONTRACT_ID })
  );
  // The active contract the backdating guard reads. Started 90 days ago, so
  // future and recently-backdated switches are accepted; only a switch dated
  // before this start is rejected.
  vi.mocked(getMetronomeContractById).mockResolvedValue(
    new Ok({
      id: EXISTING_CONTRACT_ID,
      customer_id: METRONOME_CUSTOMER_ID,
      starting_at: new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    } as never)
  );
  vi.mocked(scheduleSubscriptionCancellation).mockResolvedValue(true);
  vi.mocked(addPrepaidCommitToContract).mockResolvedValue(
    new Ok({ editId: "edit_xxx" })
  );
  vi.mocked(applySeatRateOverrides).mockResolvedValue(new Ok(undefined));
  vi.mocked(syncContractQuantities).mockResolvedValue(new Ok(undefined));
  vi.mocked(remapMembershipSeatTypesForContract).mockResolvedValue(
    new Ok(undefined)
  );
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

  it("starts immediately when startingAt is omitted", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ startingAt: undefined });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        packageAlias: "enterprise",
        planCode: ENT_PLAN_CODE,
        swapAt: "current-hour",
      })
    );
  });

  it("accepts a startingAt in the past (backdated) and schedules at the next hour boundary", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ startingAt: futureIso(-48) });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(provisionMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        packageAlias: "enterprise",
        planCode: ENT_PLAN_CODE,
        swapAt: "next-hour",
      })
    );
  });

  it("rejects a startingAt earlier than the current active contract's start", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    // Active contract started 1 hour ago; backdating 48h before it would
    // create overlapping contracts the sunset pass can't resolve.
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: EXISTING_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: futureIso(-1),
      } as never)
    );

    req.body = enterpriseBody({ startingAt: futureIso(-48) });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "before the current active contract's start"
    );
    expect(provisionMetronomeContract).not.toHaveBeenCalled();
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

describe("POST /api/poke/workspaces/[wId]/switch_contract — seats entitlement", () => {
  it("entitles a seat the package does not entitle by default via a rate override", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({
      seats: [{ seatType: "max", minSeats: 0, rate: 50 }],
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(applySeatRateOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: NEW_CONTRACT_ID,
        overrides: [
          expect.objectContaining({ productId: "prod_max", entitled: true }),
        ],
      })
    );
    // Memberships are re-mapped and seat quantities re-synced after entitlement
    // changes, so members land on a billed seat and the new seat is billed.
    expect(remapMembershipSeatTypesForContract).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: NEW_CONTRACT_ID,
        workspace: expect.objectContaining({ sId: workspace.sId }),
      })
    );
    expect(syncContractQuantities).toHaveBeenCalledWith(
      METRONOME_CUSTOMER_ID,
      NEW_CONTRACT_ID,
      expect.objectContaining({ sId: workspace.sId }),
      expect.any(String)
    );
  });

  it("disables a package-entitled seat the operator unchecks", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({
      seats: [{ seatType: "workspace", selected: false, minSeats: 0, rate: 0 }],
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(applySeatRateOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: [
          expect.objectContaining({
            productId: "prod_workspace",
            entitled: false,
          }),
        ],
      })
    );
  });

  it("rejects entitling a non-free seat at rate 0", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({
      seats: [{ seatType: "max", minSeats: 0, rate: 0 }],
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "requires a rate greater than 0"
    );
  });

  it("allows entitling the free seat at rate 0", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({
      seats: [{ seatType: "free", minSeats: 0, rate: 0 }],
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(applySeatRateOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: [expect.objectContaining({ productId: "prod_free" })],
      })
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

  it("rejects when target plan tier does not match the package tier (pro pkg, free plan)", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody({ planCode: "FREE_UPGRADED_PLAN" });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("does not match");
  });

  it("schedules the Stripe subscription to cancel at the swap moment when the workspace is Stripe-billed", async () => {
    const STRIPE_SUB_ID = "sub_stripe_xxx";
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID, {
      stripeSubscriptionId: STRIPE_SUB_ID,
    });

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(scheduleSubscriptionCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: STRIPE_SUB_ID,
        cancelAt: expect.any(Date),
      })
    );
  });

  it("does not call scheduleSubscriptionCancellation when the workspace has no Stripe subscription", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(scheduleSubscriptionCancellation).not.toHaveBeenCalled();
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — PAYG", () => {
  it("persists usageCapCredits and syncs the Metronome alert when switching to enterprise with PAYG enabled", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ paygEnabled: true, usageCapCredits: 50_000 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(adminAuth);
    expect(config?.usageCapCredits).toBe(50_000);
  });

  it("persists usageCapCredits when switching to business with PAYG enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({ paygEnabled: true, usageCapCredits: 25_000 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(adminAuth);
    expect(config?.usageCapCredits).toBe(25_000);
  });

  it("rejects PAYG on a pro contract", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = proBody({ paygEnabled: true, usageCapCredits: 10_000 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "Pay-as-you-go can only be enabled"
    );
    expect(provisionMetronomeContract).not.toHaveBeenCalled();
  });

  it("accepts paygEnabled without a usage cap (no alert)", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = enterpriseBody({ paygEnabled: true });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(adminAuth);
    expect(config?.paygEnabled).toBe(true);
    expect(config?.usageCapCredits).toBeNull();
  });

  it("preserves usageCapCredits when paygEnabled is toggled off", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await CreditUsageConfigurationResource.makeNew(adminAuth, {
      defaultDiscountPercent: 0,
      paygEnabled: true,
      usageCapCredits: 100_000,
    });

    req.body = proBody({ usageCapCredits: 100_000 });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(adminAuth);
    expect(config?.paygEnabled).toBe(false);
    expect(config?.usageCapCredits).toBe(100_000);
  });
});

describe("POST /api/poke/workspaces/[wId]/switch_contract — initial credits", () => {
  it("adds a contract-level prepaid commit with the converted invoice amount", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    // USD: $5000 invoice → 500000 cents → 500000 Metronome units (USD is cents).
    req.body = businessBody({
      initialCredits: { amountCredits: 100_000, invoiceAmount: 5000 },
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(addPrepaidCommitToContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeContractId: NEW_CONTRACT_ID,
        productId: getProductPrepaidCommitId(),
        accessAmount: 100_000,
        invoiceUnitPrice: 500_000,
        invoiceQuantity: 1,
        priority: AWU_PRIORITY_PURCHASED_COMMIT,
        applicableProductTags: ["usage"],
      })
    );
  });

  it("does not add a commit when initial credits are omitted", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(addPrepaidCommitToContract).not.toHaveBeenCalled();
  });

  it("rejects initial credits when no Stripe customer is provided", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = businessBody({
      stripeCustomerId: undefined,
      initialCredits: { amountCredits: 100_000, invoiceAmount: 5000 },
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "Initial credits require a Stripe customer"
    );
    expect(addPrepaidCommitToContract).not.toHaveBeenCalled();
  });
});
