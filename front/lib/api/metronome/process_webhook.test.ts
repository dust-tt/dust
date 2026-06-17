import {
  dispatchPaygCapReached,
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import {
  getMetronomeCommit,
  getMetronomeContractById,
  listMetronomeContracts,
  setMetronomeCommitCustomFields,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
  PLAN_CODE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import { setUserNearLimit } from "@app/lib/metronome/user_block";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  launchScheduleWorkspaceScrubWorkflow,
  terminateScheduleWorkspaceScrubWorkflow,
} from "@app/temporal/scrub_workspace/client";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { Commit, ContractV2 } from "@metronome/sdk/resources";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { processMetronomeWebhook } from "./process_webhook";

vi.mock(import("@app/lib/metronome/client"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getMetronomeContractById: vi.fn(),
    listMetronomeContracts: vi.fn(),
    getMetronomeCommit: vi.fn(),
    setMetronomeCommitCustomFields: vi.fn(),
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

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return {
    ...actual,
    getSeatAllowancesByNormalizedSeatType: vi
      .fn()
      .mockResolvedValue({ pro: 0, max: 0, workspace: 0 }),
  };
});

vi.mock("@app/lib/metronome/user_block", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/user_block")
  >("@app/lib/metronome/user_block");
  return {
    ...actual,
    setUserNearLimit: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock UserResource.fetchById and MembershipResource for handlePerUserSpendThresholdEvent.
// The default mock returns a user with a "pro" seat and a pool cap override.
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
      getActiveMembershipOfUserInWorkspace: vi.fn().mockResolvedValue({
        seatType: "pro",
        poolCapOverrideAwuCredits: 50_000,
      }),
    },
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const OLD_CONTRACT_ID = "contract_old_xxx";
const NEW_CONTRACT_ID = "contract_new_yyy";
const ENT_PLAN_CODE = "ENT_TEST_PLAN";
const USER_ID = "user_test_xxx";
const COMMIT_ID = "commit_test_xxx";

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
  threshold?: number
): MetronomeWebhookEvent {
  return {
    id: `evt_${type}_xxx`,
    type,
    properties: {
      customer_id: METRONOME_CUSTOMER_ID,
      current_spend: 1234,
      group_values: groupValues,
      threshold,
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
  vi.mocked(setUserNearLimit).mockResolvedValue(undefined);
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

// effectiveCap = poolCapOverrideAwuCredits (50_000) + seatAllowance (0, no contract in tests)
const CAP = 50_000;
const WARNING = Math.floor(0.8 * CAP); // 40_000

describe("processMetronomeWebhook — per-user spend threshold", () => {
  it("dispatches reached when cap threshold fires (reached event)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        CAP
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapResolved).not.toHaveBeenCalled();
  });

  it("dispatches resolved when cap threshold fires (resolved event)", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_resolved",
        [{ key: "user_id", value: USER_ID }],
        CAP
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(dispatchPerUserCapResolved).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });

  it("sets near-limit flag when warning threshold fires", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        WARNING
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(setUserNearLimit).toHaveBeenCalledWith(workspace.sId, USER_ID, true);
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });

  it("clears near-limit flag when warning threshold resolves", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_resolved",
        [{ key: "user_id", value: USER_ID }],
        WARNING
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(setUserNearLimit).toHaveBeenCalledWith(
      workspace.sId,
      USER_ID,
      false
    );
    expect(dispatchPerUserCapReached).not.toHaveBeenCalled();
  });

  it("ignores event with unrecognized threshold", async () => {
    const workspace = await setupMetronomeWorkspaceResource();

    const result = await processMetronomeWebhook({
      event: spendThresholdEvent(
        "alerts.spend_threshold_reached",
        [{ key: "user_id", value: USER_ID }],
        99_999
      ),
      workspace,
    });

    expect(result.isOk()).toBe(true);
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

describe("processMetronomeWebhook — commit.create DUST_CONTRACT_CREDIT_TYPE stamping", () => {
  function commitCreateEvent(
    commitCustomFields: Record<string, string> | null = null
  ): MetronomeWebhookEvent {
    return {
      id: "evt_commit_create_xxx",
      type: "commit.create",
      timestamp: new Date().toISOString(),
      commit_id: COMMIT_ID,
      commit_custom_fields: commitCustomFields,
      customer_id: METRONOME_CUSTOMER_ID,
    };
  }

  function commit(
    creditTypeId: string,
    customFields: Record<string, string> | null = null
  ): Commit {
    return {
      id: COMMIT_ID,
      created_at: new Date().toISOString(),
      product: { id: "prod_test", name: "Test Product" },
      type: "PREPAID",
      custom_fields: customFields ?? undefined,
      access_schedule: {
        schedule_items: [],
        credit_type: { id: creditTypeId, name: "AWU" },
      },
    };
  }

  beforeEach(() => {
    vi.mocked(setMetronomeCommitCustomFields).mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("stamps an unstamped AWU commit as pool", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(getMetronomeCommit).mockResolvedValue(
      new Ok(commit(getCreditTypeAwuId()))
    );

    const result = await processMetronomeWebhook({
      event: commitCreateEvent(),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(setMetronomeCommitCustomFields).toHaveBeenCalledWith({
      commitId: COMMIT_ID,
      customFields: {
        [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: CONTRACT_CREDIT_TYPE_POOL,
      },
    });
  });

  it("does not stamp a non-AWU commit", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(getMetronomeCommit).mockResolvedValue(
      new Ok(commit("non_awu_credit_type"))
    );

    const result = await processMetronomeWebhook({
      event: commitCreateEvent(),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(setMetronomeCommitCustomFields).not.toHaveBeenCalled();
  });

  it("does not re-stamp a commit that already carries the field", async () => {
    const workspace = await setupMetronomeWorkspaceResource();
    vi.mocked(getMetronomeCommit).mockResolvedValue(
      new Ok(
        commit(getCreditTypeAwuId(), {
          [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: CONTRACT_CREDIT_TYPE_POOL,
        })
      )
    );

    const result = await processMetronomeWebhook({
      event: commitCreateEvent(),
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(setMetronomeCommitCustomFields).not.toHaveBeenCalled();
  });
});
