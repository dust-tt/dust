import {
  dispatchPaygCapReached,
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import * as defaultUserCapAlert from "@app/lib/metronome/alerts/spend_limits";
import * as perUserAlerts from "@app/lib/metronome/alerts/spend_limits";
import {
  getMetronomeContractById,
  listMetronomeContracts,
} from "@app/lib/metronome/client";
import { PLAN_CODE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  launchScheduleWorkspaceScrubWorkflow,
  terminateScheduleWorkspaceScrubWorkflow,
} from "@app/temporal/scrub_workspace/client";
import { mockCustomerAlert } from "@app/tests/utils/mocks/metronome";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
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

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof defaultUserCapAlert>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    getMetronomePerUserCap: vi.fn(),
    getMetronomePerUserWarningAlert: vi.fn(),
    getMetronomeDefaultUserCapAlertForSeatType: vi.fn(),
    getMetronomeDefaultUserWarningAlertForSeatType: vi.fn(),
  };
});

// Mock UserResource.fetchById and MembershipResource for resolveUserSpendAlerts.
// The default mock returns a user with a "pro" seat so the default alert path works.
vi.mock("@app/lib/resources/user_resource", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/resources/user_resource")
  >("@app/lib/resources/user_resource");
  return {
    ...actual,
    UserResource: {
      ...actual.UserResource,
      fetchById: vi.fn().mockResolvedValue({ sId: "user_test_xxx" }),
    },
  };
});

vi.mock("@app/lib/resources/membership_resource", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/resources/membership_resource")
  >("@app/lib/resources/membership_resource");
  return {
    ...actual,
    MembershipResource: {
      ...actual.MembershipResource,
      getActiveMembershipOfUserInWorkspace: vi
        .fn()
        .mockResolvedValue({ seatType: "pro" }),
    },
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const OLD_CONTRACT_ID = "contract_old_xxx";
const NEW_CONTRACT_ID = "contract_new_yyy";
const ENT_PLAN_CODE = "ENT_TEST_PLAN";
const USER_ID = "user_test_xxx";

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
  groupValues?: Array<{ key: string; value?: string }>,
  alertId?: string
): MetronomeWebhookEvent {
  return {
    id: `evt_${type}_xxx`,
    type,
    properties: {
      customer_id: METRONOME_CUSTOMER_ID,
      alert_id: alertId,
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
    defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
  ).mockResolvedValue(new Ok(null));
  vi.mocked(perUserAlerts.getMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok(null)
  );
  vi.mocked(
    defaultUserCapAlert.getMetronomeDefaultUserWarningAlertForSeatType
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
    await PlanFactory.enterprise(ENT_PLAN_CODE);
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
    await PlanFactory.enterprise(ENT_PLAN_CODE);
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

    // Old subscription (Metronome-only) is finalized directly to `ended`: it
    // has no Stripe deletion webhook to converge it, and the concurrently-
    // firing contract.end for the old contract may arrive before this swap, so
    // a transient `ended_backend_only` would never get a follow-up to converge.
    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub).not.toBeNull();
    expect(oldSub!.status).toBe("ended");

    expect(restoreWorkspaceAfterSubscription).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — re-firing after the swap does nothing", async () => {
    await PlanFactory.enterprise(ENT_PLAN_CODE);
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
    const targetPlan = await PlanFactory.enterprise(ENT_PLAN_CODE);
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    // Stage the pending sub that switch_contract would have created.
    const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
      .id;
    await SubscriptionResource.makeNew(
      {
        sId: generateRandomModelSId(),
        workspaceId: workspaceModelId,
        planId: targetPlan.id,
        status: "created_backend_only",
        startDate: new Date(),
        endDate: null,
        stripeSubscriptionId: null,
        metronomeContractId: NEW_CONTRACT_ID,
      },
      renderPlanFromModel({ plan: targetPlan })
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

    // Prior active (Metronome-only) is finalized directly to `ended`.
    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub!.status).toBe("ended");

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

describe("processMetronomeWebhook — swap webhook ordering", () => {
  // A contract swap schedules the old contract's end and the new contract's
  // start at the same instant, so Metronome emits `contract.end` (old) and
  // `contract.start` (new) concurrently with no guaranteed delivery order.
  // When `contract.end` lands first it must not strand the old subscription in
  // `ended_backend_only`: the old sub is still active so contract.end defers to
  // contract.start, which is then the only handler left to finalize it.

  async function stagePendingSub(
    workspace: WorkspaceResource,
    contractId: string
  ): Promise<void> {
    const targetPlan = await PlanFactory.enterprise(ENT_PLAN_CODE);
    await SubscriptionResource.makeNew(
      {
        sId: generateRandomModelSId(),
        workspaceId: workspace.id,
        planId: targetPlan.id,
        status: "created_backend_only",
        startDate: new Date(),
        endDate: null,
        stripeSubscriptionId: null,
        metronomeContractId: contractId,
      },
      renderPlanFromModel({ plan: targetPlan })
    );
  }

  function mockNewContractStart(): void {
    vi.mocked(getMetronomeContractById).mockResolvedValue(
      new Ok({
        id: NEW_CONTRACT_ID,
        customer_id: METRONOME_CUSTOMER_ID,
        starting_at: new Date().toISOString(),
        custom_fields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: ENT_PLAN_CODE },
      } as never)
    );
  }

  // contract.end's "active + successor" branch lists contracts covering now and
  // finds the just-started new contract.
  function mockSuccessorContractExists(): void {
    vi.mocked(listMetronomeContracts).mockResolvedValue(
      new Ok([
        {
          id: OLD_CONTRACT_ID,
          starting_at: new Date(Date.now() - 10_000).toISOString(),
          ending_before: new Date().toISOString(),
        },
        {
          id: NEW_CONTRACT_ID,
          starting_at: new Date().toISOString(),
        },
      ] as never)
    );
  }

  it("converges the old sub to ended when contract.end precedes contract.start (pending path)", async () => {
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    await stagePendingSub(
      (await WorkspaceResource.fetchById(workspace.sId))!,
      NEW_CONTRACT_ID
    );
    mockNewContractStart();
    mockSuccessorContractExists();

    // contract.end (old) arrives first — old sub is still active, so it defers.
    const endResult = await processMetronomeWebhook({
      event: contractEvent("contract.end", OLD_CONTRACT_ID) as never,
      workspace,
    });
    expect(endResult.isOk()).toBe(true);
    expect(launchScheduleWorkspaceScrubWorkflow).not.toHaveBeenCalled();

    // contract.start (new) arrives second and performs the swap.
    const startResult = await processMetronomeWebhook({
      event: contractEvent("contract.start", NEW_CONTRACT_ID) as never,
      workspace,
    });
    expect(startResult.isOk()).toBe(true);

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const activeSub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(activeSub!.metronomeContractId).toBe(NEW_CONTRACT_ID);
    expect(activeSub!.status).toBe("active");

    // The old sub converged to `ended` and is not stranded in
    // `ended_backend_only` waiting on a contract.end that already fired.
    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub!.status).toBe("ended");
  });

  it("converges the old sub to ended when contract.end precedes contract.start (legacy fallback, no pending row)", async () => {
    await PlanFactory.enterprise(ENT_PLAN_CODE);
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID);
    mockNewContractStart();
    mockSuccessorContractExists();

    const endResult = await processMetronomeWebhook({
      event: contractEvent("contract.end", OLD_CONTRACT_ID) as never,
      workspace,
    });
    expect(endResult.isOk()).toBe(true);

    const startResult = await processMetronomeWebhook({
      event: contractEvent("contract.start", NEW_CONTRACT_ID) as never,
      workspace,
    });
    expect(startResult.isOk()).toBe(true);

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const activeSub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      refreshed!.id
    );
    expect(activeSub!.metronomeContractId).toBe(NEW_CONTRACT_ID);

    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub!.status).toBe("ended");
  });

  it("keeps a shadow-billed (Stripe-backed) old sub as ended_backend_only so Stripe converges it", async () => {
    // The fix is scoped to Metronome-only subs. A sub with a Stripe
    // subscription must still wait for Stripe's customer.subscription.deleted
    // webhook, so it ends as ended_backend_only.
    const workspace = await setupMetronomeWorkspace(OLD_CONTRACT_ID, {
      stripeSubscriptionId: "sub_shadow_xxx",
    });
    await stagePendingSub(
      (await WorkspaceResource.fetchById(workspace.sId))!,
      NEW_CONTRACT_ID
    );
    mockNewContractStart();

    const startResult = await processMetronomeWebhook({
      event: contractEvent("contract.start", NEW_CONTRACT_ID) as never,
      workspace,
    });
    expect(startResult.isOk()).toBe(true);

    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    const oldSub = await SubscriptionResource.fetchByMetronomeContractId(
      refreshed!,
      OLD_CONTRACT_ID
    );
    expect(oldSub!.status).toBe("ended_backend_only");
  });
});

describe("processMetronomeWebhook — per-user spend threshold (no default alert)", () => {
  it("dispatches reached when override cap alert fires (reached event)", async () => {
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
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        "alert_override_xxx"
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("dispatches resolved when override cap alert fires (resolved event)", async () => {
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
      event: spendThresholdEvent(
        "alerts.spend_threshold_resolved",
        [{ key: "user_id", value: USER_ID }],
        "alert_override_xxx"
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapResolved).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });

  it("ignores event when neither override nor default is configured", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    // getMetronomePerUserCap and getMetronomeDefaultUserCapAlertForSeatType default to Ok(null).

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent("alerts.spend_threshold_reached", [
        { key: "user_id", value: USER_ID },
      ]),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    // No matching alert → event ignored, no dispatch.
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
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
  it("dispatches reached when default cap alert fires (reached event)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
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
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        "alert_default_xxx"
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("override alert ID takes precedence — event matching override dispatches resolved", async () => {
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
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
    ).mockResolvedValue(
      new Ok(
        mockCustomerAlert({
          id: "alert_default_xxx",
          threshold: 1000,
          customer_status: "in_alarm",
        })
      )
    );

    // Event comes from the override alert (resolved).
    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_resolved",
        [{ key: "user_id", value: USER_ID }],
        "alert_override_xxx"
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapResolved).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
    // Override existed → default lookup was skipped.
    expect(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
    ).not.toHaveBeenCalled();
  });

  it("override alert ID takes precedence — event matching override dispatches reached", async () => {
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

    // Event comes from the override alert (reached).
    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        "alert_override_xxx"
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("ignores event from unrelated alert when override exists", async () => {
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

    // Event comes from a different alert (e.g. default for another seat type).
    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        "alert_unrelated_zzz"
      ),
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
