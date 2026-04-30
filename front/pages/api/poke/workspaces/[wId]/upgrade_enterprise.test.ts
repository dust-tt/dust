import { Authenticator } from "@app/lib/auth";
import {
  createMetronomeContract,
  findMetronomeCustomerByAlias,
  listMetronomeContracts,
  listMetronomePackages,
  scheduleMetronomeContractEnd,
  setMetronomeContractCustomFields,
} from "@app/lib/metronome/client";
import { PlanModel } from "@app/lib/models/plan";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./upgrade_enterprise";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    findMetronomeCustomerByAlias: vi.fn(),
    listMetronomePackages: vi.fn(),
    createMetronomeContract: vi.fn(),
    setMetronomeContractCustomFields: vi.fn(),
    listMetronomeContracts: vi.fn(),
    scheduleMetronomeContractEnd: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const EXISTING_CONTRACT_ID = "contract_existing_xxx";
const NEW_CONTRACT_ID = "contract_new_yyy";
const PACKAGE_ID = "pkg_ent_usd";
const ENT_PLAN_CODE = "ENT_TEST_PLAN";

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

/**
 * Patch the workspace's subscription to be Metronome-only billed (set
 * `metronomeContractId`, no `stripeSubscriptionId`) so the handler's gate
 * passes.
 */
async function makeSubscriptionMetronomeBilled(
  workspace: WorkspaceType,
  contractId: string,
  { stripeSubscriptionId = null }: { stripeSubscriptionId?: string | null } = {}
): Promise<void> {
  await WorkspaceResource.updateMetronomeCustomerId(
    (await WorkspaceResource.fetchById(workspace.sId))!.id,
    METRONOME_CUSTOMER_ID
  );
  const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
    .id;
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

function defaultBody(overrides: Record<string, unknown> = {}) {
  return {
    planCode: ENT_PLAN_CODE,
    metronomePackageId: PACKAGE_ID,
    startingAt: futureIso(2),
    freeCreditsOverrideEnabled: false,
    paygEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  // Default-happy mocks; individual tests override as needed.
  vi.mocked(findMetronomeCustomerByAlias).mockResolvedValue(
    new Ok(METRONOME_CUSTOMER_ID)
  );
  vi.mocked(listMetronomePackages).mockResolvedValue(
    new Ok([{ id: PACKAGE_ID, name: "Enterprise USD", aliases: [] }])
  );
  vi.mocked(createMetronomeContract).mockResolvedValue(
    new Ok({ contractId: NEW_CONTRACT_ID })
  );
  vi.mocked(setMetronomeContractCustomFields).mockResolvedValue(
    new Ok(undefined)
  );
  // After creation, both contracts coexist on the customer.
  vi.mocked(listMetronomeContracts).mockResolvedValue(
    new Ok([
      {
        id: EXISTING_CONTRACT_ID,
        starting_at: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        // Open-ended → should be sunset.
      },
      {
        id: NEW_CONTRACT_ID,
        starting_at: futureIso(2),
      },
    ] as never)
  );
  vi.mocked(scheduleMetronomeContractEnd).mockResolvedValue(new Ok(undefined));
});

describe("POST /api/poke/workspaces/[wId]/upgrade_enterprise — Metronome path", () => {
  it("rejects when the current subscription is not Metronome-only billed", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    // Don't make the subscription Metronome-billed — leave the WorkspaceFactory
    // default (Pro plan, no metronomeContractId).

    req.body = defaultBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "not Metronome-only billed"
    );
    expect(createMetronomeContract).not.toHaveBeenCalled();
  });

  it("accepts a metronome-billed subscription when stripeSubscriptionId is an empty string", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID, {
      stripeSubscriptionId: "",
    });

    req.body = defaultBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(createMetronomeContract).toHaveBeenCalled();
  });

  it("rejects when startingAt is in the past", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = defaultBody({ startingAt: futureIso(-1) });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "at least one hour in the future"
    );
    expect(createMetronomeContract).not.toHaveBeenCalled();
  });

  it("rejects when planCode is not an enterprise plan", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = defaultBody({ planCode: "PRO_PLAN_SEAT_29" });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "is not an enterprise plan"
    );
    expect(createMetronomeContract).not.toHaveBeenCalled();
  });

  it("rejects when packageId is unknown", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = defaultBody({ metronomePackageId: "pkg_does_not_exist" });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "Metronome package not found"
    );
    expect(createMetronomeContract).not.toHaveBeenCalled();
  });

  it("creates a new contract, stamps PLAN_CODE, sunsets the overlapping contract, and leaves the subscription untouched", async () => {
    await ensureEnterprisePlan();
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, EXISTING_CONTRACT_ID);

    req.body = defaultBody();
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    expect(createMetronomeContract).toHaveBeenCalledTimes(1);
    expect(createMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        packageId: PACKAGE_ID,
      })
    );

    expect(setMetronomeContractCustomFields).toHaveBeenCalledWith({
      contractId: NEW_CONTRACT_ID,
      customFields: { PLAN_CODE: ENT_PLAN_CODE },
    });

    // Old contract is sunset, new one is skipped by id.
    expect(scheduleMetronomeContractEnd).toHaveBeenCalledTimes(1);
    expect(scheduleMetronomeContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        contractId: EXISTING_CONTRACT_ID,
      })
    );

    // Subscription DB record is unchanged: still active, still on the old
    // contract id. The contract.start webhook is what flips it.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sub = adminAuth.subscriptionResource();
    expect(sub).not.toBeNull();
    expect(sub!.metronomeContractId).toBe(EXISTING_CONTRACT_ID);
    expect(sub!.status).toBe("active");
  });
});
