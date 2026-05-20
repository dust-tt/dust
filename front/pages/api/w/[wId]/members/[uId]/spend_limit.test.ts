import * as creditStateDispatcher from "@app/lib/api/metronome/credit_state_dispatcher";
import * as perUserAlerts from "@app/lib/metronome/per_user_alerts";
import * as perUserUsage from "@app/lib/metronome/per_user_usage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./spend_limit";

vi.mock("@app/lib/metronome/per_user_alerts", async () => {
  const actual = await vi.importActual<typeof perUserAlerts>(
    "@app/lib/metronome/per_user_alerts"
  );
  return {
    ...actual,
    syncMetronomePerUserCapAlert: vi.fn(),
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

beforeEach(() => {
  vi.mocked(perUserAlerts.syncMetronomePerUserCapAlert).mockResolvedValue(
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
    undefined
  );
  vi.mocked(creditStateDispatcher.dispatchPerUserCapResolved).mockResolvedValue(
    undefined
  );
});

describe("/api/w/[wId]/members/[uId]/spend_limit", () => {
  describe("auth", () => {
    it("returns 403 when caller is not an admin", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });
      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("workspace_auth_error");
    });

    it("returns 403 when workspace is not on Metronome billing", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });
      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("plan_limit_error");
    });
  });

  describe("method validation", () => {
    it("returns 405 for unsupported methods", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
        workspace,
      });
      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe("input validation", () => {
    it("returns 400 when uId is missing", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 404 when uId does not exist", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      req.query.uId = "nonexistent-user-id";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error.type).toBe("workspace_user_not_found");
    });

    it("returns 400 on PUT with negative awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.query.uId = user.sId;
      req.body = { kind: "limited", awuCredits: -1 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 on PUT with non-integer awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.query.uId = user.sId;
      req.body = { kind: "limited", awuCredits: 1.5 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 on PUT with awuCredits above max", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.query.uId = user.sId;
      req.body = { kind: "limited", awuCredits: 100_000_000 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });
  });

  describe("GET", () => {
    it("returns unlimited when no per-user alert exists", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ kind: "unlimited" });
    });

    it("returns limited with threshold when alert exists", async () => {
      vi.mocked(perUserAlerts.getMetronomePerUserCap).mockResolvedValueOnce(
        new Ok({
          alertId: TEST_ALERT_ID,
          threshold: 2500,
        })
      );

      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ kind: "limited", awuCredits: 2500 });
    });
  });

  describe("PUT", () => {
    it("clears alert + dispatches resolved for unlimited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.query.uId = targetUser.sId;
      req.body = { kind: "unlimited" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        limit: { kind: "unlimited" },
        transitionedTo: "resolved",
      });
      expect(perUserAlerts.clearMetronomePerUserCapAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
          workspaceSId: workspace.sId,
          userSId: targetUser.sId,
        })
      );
      expect(
        creditStateDispatcher.dispatchPerUserCapResolved
      ).toHaveBeenCalledWith(
        expect.objectContaining({ userId: targetUser.sId })
      );
      expect(perUserAlerts.syncMetronomePerUserCapAlert).not.toHaveBeenCalled();
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

      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.query.uId = targetUser.sId;
      req.body = { kind: "limited", awuCredits: 1500 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        limit: { kind: "limited", awuCredits: 1500 },
        transitionedTo: "resolved",
      });
      expect(perUserAlerts.syncMetronomePerUserCapAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
          workspaceSId: workspace.sId,
          userSId: targetUser.sId,
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

      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.query.uId = targetUser.sId;
      req.body = { kind: "limited", awuCredits: 1500 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().transitionedTo).toBe("reached");
      expect(
        creditStateDispatcher.dispatchPerUserCapReached
      ).toHaveBeenCalled();
      expect(
        creditStateDispatcher.dispatchPerUserCapResolved
      ).not.toHaveBeenCalled();
    });
  });
});
