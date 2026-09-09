import * as novuClientModule from "@app/lib/notifications/novu-client";
import {
  buildProgrammaticCapReachedEmailCopy,
  triggerProgrammaticCapReachedNotifications,
} from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { PROGRAMMATIC_CAP_REACHED_TRIGGER_ID } from "@app/types/notification_preferences";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTriggerBulk = vi.fn();

vi.mock(import("@app/lib/notifications/novu-client"), async (orig) => {
  const mod = await orig();
  return { ...mod, getNovuClient: vi.fn() };
});

beforeEach(() => {
  mockTriggerBulk.mockReset();
  mockTriggerBulk.mockResolvedValue({ result: [{}] });
  vi.mocked(novuClientModule.getNovuClient).mockResolvedValue({
    triggerBulk: mockTriggerBulk,
  } as unknown as Awaited<ReturnType<typeof novuClientModule.getNovuClient>>);
});

const ADMIN = {
  sId: "usr_admin",
  email: "admin@example.com",
  firstName: "Ada",
  lastName: null,
};

describe("buildProgrammaticCapReachedEmailCopy", () => {
  it("describes a 0 cap as paused triggers, not consumed credits", () => {
    const { subject, content } = buildProgrammaticCapReachedEmailCopy({
      workspaceName: "Acme",
      monthlyCapCredits: 0,
      reason: "programmatic_cap_disabled",
    });

    expect(subject).toBe(
      "[Dust] Your programmatic triggers are paused in Acme"
    );
    expect(content).toContain(
      'A scheduled trigger in your Dust workspace "Acme" could not run because the workspace\'s monthly programmatic usage limit is set to 0 credits.'
    );
    expect(content).toContain(
      "Programmatic triggers will remain blocked until an admin sets a positive limit in workspace usage settings."
    );
    expect(content).not.toMatch(/exhausted|consumed/);
  });

  it("keeps the exhausted-cap copy for a positive cap", () => {
    const { subject, content } = buildProgrammaticCapReachedEmailCopy({
      workspaceName: "Acme",
      monthlyCapCredits: 500,
      reason: "programmatic_cap_exhausted",
    });

    expect(subject).toBe(
      "[Dust] Your workspace has reached its programmatic API credit cap in Acme"
    );
    expect(content).toContain(
      'Your workspace "Acme" has exhausted its monthly programmatic API credit cap of 500 credits.'
    );
    expect(content).toContain(
      "blocked until the billing cycle resets or the cap is raised"
    );
  });

  it("keeps the 80% warning copy", () => {
    const { subject } = buildProgrammaticCapReachedEmailCopy({
      workspaceName: "Acme",
      monthlyCapCredits: 500,
      reason: "programmatic_cap_warning",
    });

    expect(subject).toBe(
      "[Dust] Your workspace has used 80% of its programmatic API credit cap in Acme"
    );
  });
});

describe("triggerProgrammaticCapReachedNotifications", () => {
  it("sends the reason in the payload and dedupes on the idempotency key", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });

    const res = await triggerProgrammaticCapReachedNotifications(
      authenticator,
      {
        admins: [ADMIN],
        monthlyCapCredits: 0,
        reason: "programmatic_cap_disabled",
        idempotencyKey: "k-disabled-config-none",
      }
    );

    expect(res.isOk()).toBe(true);
    expect(mockTriggerBulk).toHaveBeenCalledTimes(1);
    const [event] = mockTriggerBulk.mock.calls[0][0].events;
    expect(event.workflowId).toBe(PROGRAMMATIC_CAP_REACHED_TRIGGER_ID);
    expect(event.to.subscriberId).toBe(ADMIN.sId);
    expect(event.payload).toEqual({
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      monthlyCapCredits: 0,
      reason: "programmatic_cap_disabled",
    });
    expect(event.transactionId).toContain("k-disabled-config-none");
    expect(event.transactionId).toContain(ADMIN.sId);

    // Same cap state → same transactionId, so Novu drops the duplicate.
    await triggerProgrammaticCapReachedNotifications(authenticator, {
      admins: [ADMIN],
      monthlyCapCredits: 0,
      reason: "programmatic_cap_disabled",
      idempotencyKey: "k-disabled-config-none",
    });
    expect(mockTriggerBulk.mock.calls[1][0].events[0].transactionId).toBe(
      event.transactionId
    );

    // A new cap state → a new transactionId.
    await triggerProgrammaticCapReachedNotifications(authenticator, {
      admins: [ADMIN],
      monthlyCapCredits: 100,
      reason: "programmatic_cap_exhausted",
      idempotencyKey: "k-exhausted-cycle-1-config-2",
    });
    expect(mockTriggerBulk.mock.calls[2][0].events[0].transactionId).not.toBe(
      event.transactionId
    );
  });

  it("does nothing without admins", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });

    const res = await triggerProgrammaticCapReachedNotifications(
      authenticator,
      {
        admins: [],
        monthlyCapCredits: 0,
        reason: "programmatic_cap_disabled",
        idempotencyKey: "k",
      }
    );

    expect(res.isOk()).toBe(true);
    expect(mockTriggerBulk).not.toHaveBeenCalled();
  });

  it("returns an error when Novu reports a per-event error", async () => {
    mockTriggerBulk.mockResolvedValue({ result: [{ error: ["boom"] }] });
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });

    const res = await triggerProgrammaticCapReachedNotifications(
      authenticator,
      {
        admins: [ADMIN],
        monthlyCapCredits: 0,
        reason: "programmatic_cap_disabled",
        idempotencyKey: "k",
      }
    );

    expect(res.isErr()).toBe(true);
  });

  it("returns an error when the Novu call rejects", async () => {
    mockTriggerBulk.mockRejectedValue(new Error("network error"));
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });

    const res = await triggerProgrammaticCapReachedNotifications(
      authenticator,
      {
        admins: [ADMIN],
        monthlyCapCredits: 0,
        reason: "programmatic_cap_disabled",
        idempotencyKey: "k",
      }
    );

    expect(res.isErr()).toBe(true);
  });
});
