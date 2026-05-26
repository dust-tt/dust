import * as creditStateDispatcher from "@app/lib/api/metronome/credit_state_dispatcher";
import * as perUserAlerts from "@app/lib/metronome/per_user_alerts";
import * as perUserUsage from "@app/lib/metronome/per_user_usage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/per_user_alerts", async () => {
  const actual = await vi.importActual<typeof perUserAlerts>(
    "@app/lib/metronome/per_user_alerts"
  );
  return {
    ...actual,
    upsertMetronomePerUserCapAlert: vi.fn(),
    clearMetronomePerUserCapAlert: vi.fn(),
    getMetronomePerUserCap: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/per_user_usage", async () => {
  const actual = await vi.importActual<typeof perUserUsage>(
    "@app/lib/metronome/per_user_usage"
  );
  return {
    ...actual,
    fetchPerUserAwuUsage: vi.fn(),
  };
});

vi.mock("@app/lib/api/metronome/credit_state_dispatcher", async () => {
  const actual = await vi.importActual<typeof creditStateDispatcher>(
    "@app/lib/api/metronome/credit_state_dispatcher"
  );
  return {
    ...actual,
    dispatchPerUserCapReached: vi.fn(),
    dispatchPerUserCapResolved: vi.fn(),
  };
});

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";
const TEST_ALERT_ID = "alert_test_xxx";

async function makeMetronomeWorkspaceWithCustomer(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({
    metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
  });
}

function spendLimitUrl(wId: string, uId: string) {
  return `/api/w/${wId}/members/${uId}/spend_limit`;
}

beforeEach(() => {
  vi.mocked(perUserAlerts.upsertMetronomePerUserCapAlert).mockResolvedValue(
    new Ok({ alertId: TEST_ALERT_ID })
  );
  vi.mocked(perUserAlerts.clearMetronomePerUserCapAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValue(
    new Ok(null)
  );
  vi.mocked(perUserUsage.fetchPerUserAwuUsage).mockResolvedValue(
    new Ok(new Map())
  );
  vi.mocked(creditStateDispatcher.dispatchPerUserCapReached).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(creditStateDispatcher.dispatchPerUserCapResolved).mockResolvedValue(
    new Ok(undefined)
  );
});

describe("/api/w/[wId]/members/[uId]/spend_limit", () => {
  describe("auth", () => {
    it("returns 403 when caller is not an admin", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("returns 403 when workspace is not on Metronome billing", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("plan_limit_error");
    });
  });

  describe("method validation", () => {
    it("returns 404 for unsupported methods", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("input validation", () => {
    it("returns 404 when uId does not exist", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, "nonexistent-user-id")
      );

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe(
        "workspace_user_not_found"
      );
    });

    it("returns 400 on PUT with negative awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: -1 }),
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 on PUT with non-integer awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 1.5 }),
        }
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 on PUT with awuCredits above max", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 100_000_000 }),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET", () => {
    it("returns unlimited when no per-user alert exists", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ kind: "unlimited" });
    });

    it("returns limited with threshold when alert exists", async () => {
      vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValueOnce(
        new Ok({
          alert: {
            id: TEST_ALERT_ID,
            name: "test alert",
            status: "enabled",
            threshold: 2500,
            type: "spend_threshold_reached",
            updated_at: "2024-01-01T00:00:00Z",
          },
          customer_status: "ok",
        })
      );

      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        kind: "limited",
        awuCredits: 2500,
      });
    });
  });

  describe("PUT", () => {
    it("clears alert + dispatches resolved for unlimited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "unlimited" }),
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        limit: { kind: "unlimited" },
        transitionedTo: "resolved",
      });
      expect(perUserAlerts.clearMetronomePerUserCapAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
          workspaceId: workspace.sId,
          userId: targetUser.sId,
        })
      );
      expect(
        creditStateDispatcher.dispatchPerUserCapResolved
      ).toHaveBeenCalledWith(
        expect.objectContaining({ userId: targetUser.sId })
      );
      expect(
        perUserAlerts.upsertMetronomePerUserCapAlert
      ).not.toHaveBeenCalled();
    });

    it("syncs alert + dispatches resolved when usage is below cap", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      vi.mocked(perUserUsage.fetchPerUserAwuUsage).mockResolvedValueOnce(
        new Ok(new Map([[targetUser.sId, 500]]))
      );

      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 1500 }),
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        limit: { kind: "limited", awuCredits: 1500 },
        transitionedTo: "resolved",
      });
      expect(perUserAlerts.upsertMetronomePerUserCapAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
          workspaceId: workspace.sId,
          userId: targetUser.sId,
          awuCredits: 1500,
        })
      );
      expect(
        creditStateDispatcher.dispatchPerUserCapResolved
      ).toHaveBeenCalled();
      expect(
        creditStateDispatcher.dispatchPerUserCapReached
      ).not.toHaveBeenCalled();
    });

    it("dispatches reached when usage is at/above cap", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      vi.mocked(perUserUsage.fetchPerUserAwuUsage).mockResolvedValueOnce(
        new Ok(new Map([[targetUser.sId, 2000]]))
      );

      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 1500 }),
        }
      );

      expect(response.status).toBe(200);
      expect((await response.json()).transitionedTo).toBe("reached");
      expect(
        creditStateDispatcher.dispatchPerUserCapReached
      ).toHaveBeenCalled();
      expect(
        creditStateDispatcher.dispatchPerUserCapResolved
      ).not.toHaveBeenCalled();
    });
  });
});
