import {
  dispatchPaygCapReached,
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import {
  getMetronomeContractById,
  listMetronomeContracts,
} from "@app/lib/metronome/client";
import { PLAN_CODE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import * as defaultUserCapAlert from "@app/lib/metronome/default_user_cap_alert";
import * as perUserAlerts from "@app/lib/metronome/per_user_alerts";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { PlanModel } from "@app/lib/models/plan";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  launchScheduleWorkspaceScrubWorkflow,
  terminateScheduleWorkspaceScrubWorkflow,
} from "@app/temporal/scrub_workspace/client";
import { mockCustomerAlert } from "@app/tests/utils/mocks/metronome";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { ContractV2 } from "@metronome/sdk/resources";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { processMetronomeWebhook } from "./process_webhook";

vi.mock(import("@app/lib/metronome/client"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
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

vi.mock("@app/lib/api/metronome/credit_state_dispatcher", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/api/metronome/credit_state_dispatcher")
  >("@app/lib/api/metronome/credit_state_dispatcher");
  return {
    ...actual,
    dispatchPerUserCapReached: vi.fn(),
    dispatchPerUserCapResolved: vi.fn(),
    dispatchPaygCapReached: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/per_user_alerts", async () => {
  const actual = await vi.importActual<typeof perUserAlerts>(
    "@app/lib/metronome/per_user_alerts"
  );
  return {
    ...actual,
    getMetronomePerUserCap: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/default_user_cap_alert", async () => {
  const actual = await vi.importActual<typeof defaultUserCapAlert>(
    "@app/lib/metronome/default_user_cap_alert"
  );
  return {
    ...actual,
    getMetronomeDefaultUserCapAlert: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const OLD_CONTRACT_ID = "contract_old_xxx";
const NEW_CONTRACT_ID = "contract_new_yyy";
const ENT_PLAN_CODE = "ENT_TEST_PLAN";
const USER_ID = "user_test_xxx";

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

function spendThresholdEvent(
  type: "alerts.spend_threshold_reached" | "alerts.spend_threshold_resolved",
  groupValues?: Array<{ key: string; value?: string }>
): MetronomeWebhookEvent {
  return {
    id: `evt_${type}_xxx`,
    type,
    properties: {
      customer_id: METRONOME_CUSTOMER_ID,
      current_spend: 1234,
      group_values: groupValues,
    },
  } as MetronomeWebhookEvent;
}

async function setupMetronomeWorkspace(
  contractId: string,
  { stripeSubscriptionId = null }: { stripeSubscriptionId?: string | null } = {}
): Promise<WorkspaceResource> {
  const lightWorkspace = await WorkspaceFactory.basic();
  const workspace = (await WorkspaceResource.fetchById(lightWorkspace.sId))!;
  await WorkspaceResource.updateMetronomeCustomerId(
    workspace.id,
    METRONOME_CUSTOMER_ID
  );
  const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  await sub!.markAsEnded("ended");
  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId: workspace.id,
      planId: sub!.planId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId,
      metronomeContractId: contractId,
    },
    sub!.getPlan()
  );
  return workspace;
}

async function setupMetronomeWorkspaceResource(): Promise<WorkspaceResource> {
  const lightWorkspace = await WorkspaceFactory.metronome({
    metronomeCustomerId: METRONOME_CUSTOMER_ID,
  });
  return (await WorkspaceResource.fetchById(lightWorkspace.sId))!;
}

beforeEach(() => {
  vi.mocked(launchScheduleWorkspaceScrubWorkflow).mockResolvedValue(
    new Ok(undefined as never)
  );
  vi.mocked(terminateScheduleWorkspaceScrubWorkflow).mockResolvedValue(
    new Ok({} as never)
  );
  vi.mocked(restoreWorkspaceAfterSubscription).mockResolvedValue(undefined);
  vi.mocked(dispatchPerUserCapReached).mockResolvedValue(new Ok(undefined));
  vi.mocked(dispatchPerUserCapResolved).mockResolvedValue(new Ok(undefined));
  vi.mocked(dispatchPaygCapReached).mockResolvedValue(undefined);
  vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
    new Ok(null)
  );
  vi.mocked(
    defaultUserCapAlert.getMetronomeDefaultUserCapAlert
  ).mockResolvedValue(new Ok(null));
});

describe("processMetronomeWebhook — contract.start", () => {
  it("does nothing when the new contract has no PLAN_CODE custom field", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        // no custom_fields
      } as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);

    // Subscription is unchanged.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
    expect(restoreWorkspaceAfterSubscription).not.toHaveBeenCalled();
  });

  it("does nothing when the active subscription is shadow-billed (Stripe + Metronome)", async () => {
    // Shadow-billed: Stripe is the source of truth, Metronome runs in
    // parallel. The webhook must not flip the subscription on contract.start
    // — Stripe drives that transition on its own webhook.
    await ensureEnterprisePlan();
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID, {
      stripeSubscriptionId: "sub_shadow_xxx",
    });
    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: {
          [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE,
        },
      } as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);

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
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: "ENT_PLAN_UNKNOWN" },
      } as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);

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
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE },
      } as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);

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
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE },
      } as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);
    expect(restoreWorkspaceAfterSubscription).not.toHaveBeenCalled();

    // Subscription still points at the same contract — no swap performed.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.metronomeContractId).toBe(NEW_CONTRACT_ID);
  });

  it("flips a pending (created_backend_only) subscription to active and ends the prior active", async () => {
    await ensureEnterprisePlan();
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    // Stage the pending sub that switch_contract would have created.
    const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
      .id;
    const targetPlan = await PlanModel.findOne({
      where: { code: ENT_PLAN_CODE },
    });
    await SubscriptionResource.makeNew(
      {
        sId: generateRandomModelSId(),
        workspaceId: workspaceModelId,
        planId: targetPlan!.id,
        status: "created_backend_only",
        startDate: new Date(),
        endDate: null,
        stripeSubscriptionId: null,
        metronomeContractId: NEW_CONTRACT_ID,
      },
      renderPlanFromModel({ plan: targetPlan! })
    );

    const event = contractEvent("contract.start", NEW_CONTRACT_ID);
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE },
      } as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);

    // Pending sub is now active.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const activeSub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(activeSub!.metronomeContractId).toBe(NEW_CONTRACT_ID);
    expect(activeSub!.status).toBe("active");
    expect(activeSub!.getPlan().code).toBe(ENT_PLAN_CODE);

    // Prior active is ended_backend_only (was Metronome-billed).
    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub!.status).toBe("ended_backend_only");

    expect(restoreWorkspaceAfterSubscription).toHaveBeenCalledTimes(1);
  });
});

describe("processMetronomeWebhook — contract.end", () => {
  it("skips scrub when an active successor contract exists on the customer", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
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

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);
    expect(launchScheduleWorkspaceScrubWorkflow).not.toHaveBeenCalled();

    // Subscription left untouched — contract.start will swap it.
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.status).toBe("active");
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
  });

  it("returns Err and leaves the subscription untouched when the successor check fails", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isErr()).toBe(true);
    expect(launchScheduleWorkspaceScrubWorkflow).not.toHaveBeenCalled();

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.status).toBe("active");
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
  });

  it("scrubs the workspace when no successor contract exists", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Ok([
        {
          id: OLD_CONTRACT_ID,
          starting_at: new Date(Date.now() - 10_000).toISOString(),
          ending_before: new Date().toISOString(),
        },
      ] as never)
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isOk()).toBe(true);
    expect(launchScheduleWorkspaceScrubWorkflow).toHaveBeenCalledTimes(1);
  });

  it("leaves the subscription active when the scrub launch fails, so a retry can complete", async () => {
    // Reordering guarantee: a scrub-launch failure must not leave the
    // subscription in "ended" status, otherwise the retry would dispatch
    // to the no-op branch and the scrub would never run.
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    const event = contractEvent("contract.end", OLD_CONTRACT_ID);
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Ok([
        {
          id: OLD_CONTRACT_ID,
          starting_at: new Date(Date.now() - 10_000).toISOString(),
          ending_before: new Date().toISOString(),
        } as unknown as ContractV2,
      ])
    );
    vi.mocked(launchScheduleWorkspaceScrubWorkflow).mockResolvedValueOnce(
      new Err(new Error("Temporal unavailable"))
    );

    const result = await processMetronomeWebhook({
      event: event as never,
      workspace,
    });
    expect(result.isErr()).toBe(true);
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(sub!.status).toBe("active");
    expect(sub!.metronomeContractId).toBe(OLD_CONTRACT_ID);
  });
});

describe("processMetronomeWebhook — per-user spend threshold (no default alert)", () => {
  it("dispatches reached when override is IN_ALARM (on reached event)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_override_xxx",
          threshold: 1000,
          customer_status: "in_alarm",
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("dispatches resolved when override is OK (on resolved event)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_override_xxx",
          threshold: 1000,
          customer_status: "ok",
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_resolved", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapResolved).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });

  it("no-ops when neither override nor default is configured (defensive)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    // getMetronomePerUserCap and getMetronomeDefaultUserCapAlert default to Ok(null).

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
    // With no alert in place, effective state is "ok" → dispatch resolved.
    expect(dispatchPerUserCapResolved).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
  });

  it("skips per-user events with no user_id value", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id" },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
    // No fetch attempted — handler bails before reading override state.
    expect(perUserAlerts.getMetronomePerUserCap).not.toHaveBeenCalled();
  });
});

describe("processMetronomeWebhook — per-user spend threshold (default alert configured)", () => {
  it("uses default alert state when no override exists (IN_ALARM → reached)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_default_xxx",
          threshold: 50_000,
          customer_status: "in_alarm",
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("override (OK) wins over default (IN_ALARM) — dispatches resolved", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_override_xxx",
          threshold: 999_999,
          customer_status: "ok",
        })
      )
    );
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_default_xxx",
          threshold: 1000,
          customer_status: "in_alarm",
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapResolved).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
    // Override existed → default lookup was skipped.
    expect(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).not.toHaveBeenCalled();
  });

  it("override (IN_ALARM) wins over default (OK) — dispatches reached", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_override_xxx",
          threshold: 100,
          customer_status: "in_alarm",
        })
      )
    );
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_default_xxx",
          threshold: 1_000_000,
          customer_status: "ok",
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_resolved", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("no-ops when effective state is EVALUATING", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_default_xxx",
          threshold: 50_000,
          customer_status: "evaluating",
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("returns processing_failed when override lookup fails", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("processing_failed");
    }
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });
});

describe("processMetronomeWebhook — workspace-level spend threshold", () => {
  it("dispatches PAYG cap reached when group_values has no user_id key", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached"),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPaygCapReached).toHaveBeenCalled();
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });

  it("logs and no-ops on workspace-level resolved", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_resolved"),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPaygCapReached).not.toHaveBeenCalled();
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });
});
