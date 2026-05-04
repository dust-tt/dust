import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import {
  getMetronomeClient,
  getMetronomeContractById,
  listMetronomeContracts,
} from "@app/lib/metronome/client";
import { PLAN_CODE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import { PlanModel } from "@app/lib/models/plan";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  launchScheduleWorkspaceScrubWorkflow,
  terminateScheduleWorkspaceScrubWorkflow,
} from "@app/temporal/scrub_workspace/client";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { createResponse } from "node-mocks-http";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./webhook";

vi.mock(import("@app/lib/api/config"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    default: {
      ...mod.default,
      getMetronomeWebhookSecret: vi.fn().mockReturnValue("test-secret"),
    },
  };
});

vi.mock(import("@app/lib/metronome/client"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getMetronomeClient: vi.fn(),
    getMetronomeContractById: vi.fn(),
    listMetronomeContracts: vi.fn(),
  };
});

vi.mock("@app/temporal/scrub_workspace/client", () => ({
  launchScheduleWorkspaceScrubWorkflow: vi.fn(),
  terminateScheduleWorkspaceScrubWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/subscription", () => ({
  restoreWorkspaceAfterSubscription: vi.fn(),
}));

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const OLD_CONTRACT_ID = "contract_old_xxx";
const NEW_CONTRACT_ID = "contract_new_yyy";
const ENT_PLAN_CODE = "ENT_TEST_PLAN";
const NON_ENTERPRISE_PLAN_CODE = "PRO_PLAN_SEAT_29";

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

/** Build a contract event payload that matches the centralized webhook schema. */
function contractEvent(
  type: "contract.start" | "contract.end",
  contractId: string,
  customerId: string = METRONOME_CUSTOMER_ID
) {
  return {
    type,
    id: `evt_${type}_${contractId}`,
    timestamp: new Date().toISOString(),
    contract_id: contractId,
    customer_id: customerId,
  };
}

/**
 * Build a request-like Readable carrying the JSON body, plus a response mock.
 * The webhook handler reads the raw body via `pipeline(req, collector)`, so
 * the request needs to be a real stream — node-mocks-http's request isn't.
 */
function makeWebhookRequest(eventBody: Record<string, unknown>) {
  const rawBody = Buffer.from(JSON.stringify(eventBody));
  const stream = Readable.from([rawBody]) as Readable & {
    method: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    cookies: Record<string, string>;
    socket: { remoteAddress: string };
  };
  stream.method = "POST";
  stream.headers = { "x-metronome-signature": "fake" };
  stream.query = {};
  stream.cookies = {};
  stream.socket = { remoteAddress: "127.0.0.1" };
  const res = createResponse();
  return { req: stream as never, res };
}

async function setupMetronomeWorkspace(
  contractId: string
): Promise<WorkspaceType> {
  const workspace = await WorkspaceFactory.basic();
  const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
    .id;
  await WorkspaceResource.updateMetronomeCustomerId(
    workspaceModelId,
    METRONOME_CUSTOMER_ID
  );
  const sub =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspaceModelId);
  await sub!.markAsEnded("ended");
  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId: workspaceModelId,
      planId: sub!.planId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId: null,
      metronomeContractId: contractId,
    },
    sub!.getPlan()
  );
  return workspace;
}

beforeEach(() => {
  vi.mocked(launchScheduleWorkspaceScrubWorkflow).mockResolvedValue(
    new Ok(undefined as never)
  );
  vi.mocked(terminateScheduleWorkspaceScrubWorkflow).mockResolvedValue(
    new Ok({} as never)
  );
  vi.mocked(restoreWorkspaceAfterSubscription).mockResolvedValue(undefined);
});

/** Stub `getMetronomeClient().webhooks.unwrap` to bypass signature verification. */
function mockUnwrap(event: Record<string, unknown>) {
  vi.mocked(getMetronomeClient).mockReturnValue({
    webhooks: { unwrap: vi.fn().mockReturnValue(event) },
  } as never);
}

describe("Metronome webhook — contract.start", () => {
  it("does nothing when the new contract has no PLAN_CODE custom field", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        // no custom_fields
      } as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Subscription is unchanged.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
    expect(restoreWorkspaceAfterSubscription).not.toHaveBeenCalled();
  });

  it("does nothing when PLAN_CODE refers to a non-enterprise plan", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: {
          [PLAN_CODE_CUSTOM_FIELD_KEY]: NON_ENTERPRISE_PLAN_CODE,
        },
      } as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
    expect(restoreWorkspaceAfterSubscription).not.toHaveBeenCalled();
  });

  it("does nothing when PLAN_CODE does not resolve to a Dust plan", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: "ENT_PLAN_UNKNOWN" },
      } as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
    expect(restoreWorkspaceAfterSubscription).not.toHaveBeenCalled();
  });

  it("ends the current subscription and creates a new active one with the target plan code on a successful swap", async () => {
    await ensureEnterprisePlan();
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE },
      } as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Active subscription now points at the new contract id.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const newSub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(newSub!.metronomeContractId).toBe(NEW_CONTRACT_ID);
    expect(newSub!.status).toBe("active");

    // Old subscription was preserved as `ended_backend_only` so the eventual
    // contract.end webhook for the old contract finds it in that state and
    // does not scrub.
    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub).not.toBeNull();
    expect(oldSub!.status).toBe("ended_backend_only");

    expect(restoreWorkspaceAfterSubscription).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — re-firing after the swap does nothing", async () => {
    await ensureEnterprisePlan();
    const workspace = await setupMetronomeWorkspace(NEW_CONTRACT_ID);
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE },
      } as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(restoreWorkspaceAfterSubscription).not.toHaveBeenCalled();

    // Subscription still points at the same contract — no swap performed.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.metronomeContractId).toBe(NEW_CONTRACT_ID);
  });
});

describe("Metronome webhook — contract.end", () => {
  it("skips scrub when an active successor contract exists on the customer", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Ok([
        {
          id: OLD_CONTRACT_ID,
          starting_at: new Date(Date.now() - 10_000).toISOString(),
          ending_before: new Date().toISOString(),
        },
        {
          id: NEW_CONTRACT_ID,
          starting_at: new Date(Date.now() - 5_000).toISOString(),
          // open-ended → currently active
        },
      ] as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(launchScheduleWorkspaceScrubWorkflow).not.toHaveBeenCalled();

    // Subscription left untouched — contract.start will swap it.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.status).toBe("active");
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
  });

  it("returns 500 and leaves the subscription untouched when the successor check fails", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(launchScheduleWorkspaceScrubWorkflow).not.toHaveBeenCalled();

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.status).toBe("active");
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
  });

  it("scrubs the workspace when no successor contract exists", async () => {
    await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
    mockUnwrap(event);
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Ok([
        {
          id: OLD_CONTRACT_ID,
          starting_at: new Date(Date.now() - 10_000).toISOString(),
          ending_before: new Date().toISOString(),
        },
      ] as never)
    );

    const { req, res } = makeWebhookRequest(event);
    await handler(req, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(launchScheduleWorkspaceScrubWorkflow).toHaveBeenCalledTimes(1);
  });
});
