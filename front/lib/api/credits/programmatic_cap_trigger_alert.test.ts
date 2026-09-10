import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { notifyAdminsTriggerBlockedByProgrammaticCap } from "@app/lib/api/credits/programmatic_cap_trigger_alert";
import { syncProgrammaticUsageLimit } from "@app/lib/api/credits/programmatic_usage_limit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import * as capNotification from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import type {
  TriggerExecutionMode,
  TriggerStatus,
  TriggerType,
} from "@app/types/assistant/triggers";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/notifications/workflows/programmatic-cap-reached",
  async () => {
    const actual = await vi.importActual<typeof capNotification>(
      "@app/lib/notifications/workflows/programmatic-cap-reached"
    );
    return { ...actual, triggerProgrammaticCapReachedNotifications: vi.fn() };
  }
);

vi.mock("@app/lib/metronome/contracts", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/metronome/contracts")>();
  return { ...actual, getCachedMetronomeCurrentBillingPeriod: vi.fn() };
});

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEvent: vi.fn() };
});

const CYCLE_START = new Date("2026-09-01T00:00:00.000Z");
const CYCLE_END = new Date("2026-10-01T00:00:00.000Z");

// The service throttles its check per workspace; tests that need a second
// check to run move the clock past the window.
const PAST_THROTTLE_WINDOW_MS = 61 * 1000;

function advanceClockPastThrottleWindow() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + PAST_THROTTLE_WINDOW_MS);
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  vi.mocked(
    capNotification.triggerProgrammaticCapReachedNotifications
  ).mockResolvedValue(new Ok(undefined));
  vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
    new Ok({ cycleStart: CYCLE_START, cycleEnd: CYCLE_END })
  );
});

// The trigger is created disabled (the factory default, which keeps Temporal
// out of the test) and reported to the service in the state under test.
async function setup({
  plan = "creditPriced",
  status = "enabled",
  executionMode = "workspace_pool",
}: {
  plan?: "basic" | "creditPriced";
  status?: TriggerStatus;
  executionMode?: TriggerExecutionMode;
} = {}): Promise<{
  auth: Authenticator;
  adminSId: string;
  workspaceSId: string;
  trigger: TriggerType;
}> {
  const { authenticator, user, workspace } = await createResourceTest({
    role: "admin",
    plan,
  });
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator, {
    name: "Schedule Agent",
  });
  const triggerResource = await TriggerFactory.schedule(authenticator, {
    agentConfigurationId: agent.sId,
    configuration: { cron: "0 9 * * *", timezone: "UTC" },
    executionMode,
  });

  return {
    auth: authenticator,
    adminSId: user.sId,
    workspaceSId: workspace.sId,
    trigger: { ...triggerResource.toJSON(), status },
  };
}

const notify = () =>
  vi.mocked(capNotification.triggerProgrammaticCapReachedNotifications);

describe("notifyAdminsTriggerBlockedByProgrammaticCap", () => {
  it("sends one admin notification when the cap is 0", async () => {
    const { auth, adminSId, workspaceSId, trigger } = await setup();

    const res = await notifyAdminsTriggerBlockedByProgrammaticCap(auth, {
      trigger,
    });

    expect(res.isOk()).toBe(true);
    expect(notify()).toHaveBeenCalledTimes(1);
    const [calledAuth, args] = notify().mock.calls[0];
    expect(calledAuth.getNonNullableWorkspace().sId).toBe(workspaceSId);
    expect(args).toEqual(
      expect.objectContaining({
        monthlyCapCredits: 0,
        reason: "programmatic_cap_disabled",
        admins: [expect.objectContaining({ sId: adminSId })],
      })
    );
  });

  it("does not send duplicates on repeated blocked runs", async () => {
    const { auth, trigger } = await setup();

    // Back-to-back runs (a burst) and runs spaced past the throttle window
    // (later scheduled fires) both stay silent.
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });
    advanceClockPastThrottleWindow();
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).toHaveBeenCalledTimes(1);
  });

  it("sends a new notification when the cap configuration changes state", async () => {
    const { auth, trigger } = await setup();

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });
    expect(notify()).toHaveBeenCalledTimes(1);
    expect(notify().mock.calls[0][1].reason).toBe("programmatic_cap_disabled");

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 100 });
    advanceClockPastThrottleWindow();
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).toHaveBeenCalledTimes(2);
    expect(notify().mock.calls[1][1]).toEqual(
      expect.objectContaining({
        monthlyCapCredits: 100,
        reason: "programmatic_cap_exhausted",
      })
    );
    expect(notify().mock.calls[1][1].idempotencyKey).not.toBe(
      notify().mock.calls[0][1].idempotencyKey
    );
  });

  it("does not re-arm on an unrelated usage-configuration change", async () => {
    const { auth, trigger } = await setup();
    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 0 });

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });
    expect(notify()).toHaveBeenCalledTimes(1);

    const configuration =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
    await configuration?.updateConfiguration(auth, {
      defaultDiscountPercent: 10,
    });
    advanceClockPastThrottleWindow();
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).toHaveBeenCalledTimes(1);
  });

  it("keys a positive cap on the billing cycle", async () => {
    const { auth, trigger } = await setup();
    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 100 });

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).toHaveBeenCalledTimes(1);
    const { reason, idempotencyKey } = notify().mock.calls[0][1];
    expect(reason).toBe("programmatic_cap_exhausted");
    expect(idempotencyKey).toContain(`cycle-${CYCLE_START.getTime()}`);
  });

  it("stays silent for a positive cap without a resolvable billing cycle", async () => {
    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Ok(null)
    );
    const { auth, trigger } = await setup();
    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 100 });

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).not.toHaveBeenCalled();
  });

  it("retries on the next run when the send failed", async () => {
    notify().mockResolvedValueOnce(
      new Err(new DustError("internal_error", "novu down"))
    );
    const { auth, trigger } = await setup();

    const first = await notifyAdminsTriggerBlockedByProgrammaticCap(auth, {
      trigger,
    });
    expect(first.isErr()).toBe(true);

    advanceClockPastThrottleWindow();
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });
    advanceClockPastThrottleWindow();
    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    // The failed attempt left no sent marker; the next run sends, then dedupes.
    expect(notify()).toHaveBeenCalledTimes(2);
  });

  it("does not notify for disabled triggers", async () => {
    const { auth, trigger } = await setup({ status: "disabled" });

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).not.toHaveBeenCalled();
  });

  it("does not notify for triggers charged to the user pool", async () => {
    const { auth, trigger } = await setup({ executionMode: "user_pool" });

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).not.toHaveBeenCalled();
  });

  it("does not notify workspaces that are not credit-priced", async () => {
    const { auth, trigger } = await setup({ plan: "basic" });

    await notifyAdminsTriggerBlockedByProgrammaticCap(auth, { trigger });

    expect(notify()).not.toHaveBeenCalled();
  });
});
