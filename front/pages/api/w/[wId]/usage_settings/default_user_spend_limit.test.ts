import * as businessLayer from "@app/lib/api/workspace/default_user_spend_limit";
import { DefaultUserSpendLimitError } from "@app/lib/api/workspace/default_user_spend_limit";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./default_user_spend_limit";

vi.mock("@app/lib/api/workspace/default_user_spend_limit", async () => {
  const actual = await vi.importActual<typeof businessLayer>(
    "@app/lib/api/workspace/default_user_spend_limit"
  );
  return {
    ...actual,
    getDefaultUserSpendLimit: vi.fn(),
    setDefaultUserSpendLimit: vi.fn(),
  };
});

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

async function makeMetronomeWorkspace(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({
    metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
  });
}

beforeEach(() => {
  vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValue(
    new Ok({ awuCredits: 1000 })
  );
  vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValue(
    new Ok({ awuCredits: 1000 })
  );
});

describe("/api/w/[wId]/usage_settings/default_user_spend_limit", () => {
  describe("auth", () => {
    it("returns 403 when caller is not an admin", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("workspace_auth_error");
    });

    it("returns 403 when workspace is not Metronome-billed", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("plan_limit_error");
    });
  });

  describe("method validation", () => {
    it("returns 405 for unsupported methods", async () => {
      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
        workspace,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe("GET", () => {
    it("returns the configured threshold", async () => {
      vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValueOnce(
        new Ok({ awuCredits: 25_000 })
      );

      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ awuCredits: 25_000 });
    });

    it("returns 200 with awuCredits=null when no default is configured", async () => {
      vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(new DefaultUserSpendLimitError("not_found", "no default"))
      );

      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ awuCredits: null });
    });

    it("returns 502 on Metronome errors", async () => {
      vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(new DefaultUserSpendLimitError("metronome_error", "boom"))
      );

      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(502);
    });
  });

  describe("PUT", () => {
    it("updates the threshold and returns the new value", async () => {
      vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValueOnce(
        new Ok({ awuCredits: 5000 })
      );

      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = { awuCredits: 5000 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ awuCredits: 5000 });
      expect(businessLayer.setDefaultUserSpendLimit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ awuCredits: 5000 })
      );
    });

    it("returns 400 when awuCredits is missing", async () => {
      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = {};

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
      expect(businessLayer.setDefaultUserSpendLimit).not.toHaveBeenCalled();
    });

    it("returns 400 when awuCredits is negative", async () => {
      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = { awuCredits: -1 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 when awuCredits is non-integer", async () => {
      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = { awuCredits: 1.5 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 when awuCredits exceeds the max", async () => {
      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = { awuCredits: 100_000_000 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("maps invalid_threshold from the business layer to 400", async () => {
      vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(
          new DefaultUserSpendLimitError("invalid_threshold", "out of range")
        )
      );

      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = { awuCredits: 1000 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 502 when the business layer reports a Metronome error", async () => {
      vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(new DefaultUserSpendLimitError("metronome_error", "boom"))
      );

      const workspace = await makeMetronomeWorkspace();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      req.body = { awuCredits: 1000 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(502);
    });
  });
});
