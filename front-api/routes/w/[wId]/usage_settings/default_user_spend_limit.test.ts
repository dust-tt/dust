import * as businessLayer from "@app/lib/api/workspace/default_user_spend_limit";
import { DefaultUserSpendLimitError } from "@app/lib/api/workspace/default_user_spend_limit";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function getRequest(wId: string) {
  return honoApp.request(
    `/api/w/${wId}/usage_settings/default_user_spend_limit`
  );
}

function putRequest(wId: string, body: Record<string, unknown>) {
  return honoApp.request(
    `/api/w/${wId}/usage_settings/default_user_spend_limit`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
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
      const { workspace } = await createPrivateApiMockRequest({
        role: "user",
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(403);
      const data = (await response.json()) as { error: { type: string } };
      expect(data.error.type).toBe("workspace_auth_error");
    });

    it("returns 403 when workspace is not Metronome-billed", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(403);
      const data = (await response.json()) as { error: { type: string } };
      expect(data.error.type).toBe("plan_limit_error");
    });
  });

  describe("method validation", () => {
    it("returns 404 for unsupported methods", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        `/api/w/${workspace.sId}/usage_settings/default_user_spend_limit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      // Hono returns 404 for unregistered methods (no route matched).
      expect(response.status).toBe(404);
    });
  });

  describe("GET", () => {
    it("returns the configured threshold", async () => {
      vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValueOnce(
        new Ok({ awuCredits: 25_000 })
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ awuCredits: 25_000 });
    });

    it("returns 200 with the resolved default (plan-tier fallback, pro plan → 0)", async () => {
      vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValueOnce(
        new Ok({ awuCredits: 0 })
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ awuCredits: 0 });
    });

    it("returns 502 on Metronome errors", async () => {
      vi.mocked(businessLayer.getDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(new DefaultUserSpendLimitError("metronome_error", "boom"))
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(502);
    });
  });

  describe("PUT", () => {
    it("updates the threshold and returns the new value", async () => {
      vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValueOnce(
        new Ok({ awuCredits: 5000 })
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, { awuCredits: 5000 });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ awuCredits: 5000 });
      expect(businessLayer.setDefaultUserSpendLimit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ awuCredits: 5000 })
      );
    });

    it("returns 400 when awuCredits is missing", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {});

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: { type: string } };
      expect(data.error.type).toBe("invalid_request_error");
      expect(businessLayer.setDefaultUserSpendLimit).not.toHaveBeenCalled();
    });

    it("returns 400 when awuCredits is negative", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, { awuCredits: -1 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when awuCredits is non-integer", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, { awuCredits: 1.5 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when awuCredits exceeds the max", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        awuCredits: 100_000_000,
      });

      expect(response.status).toBe(400);
    });

    it("maps invalid_threshold from the business layer to 400", async () => {
      vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(
          new DefaultUserSpendLimitError("invalid_threshold", "out of range")
        )
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, { awuCredits: 1000 });

      expect(response.status).toBe(400);
    });

    it("returns 502 when the business layer reports a Metronome error", async () => {
      vi.mocked(businessLayer.setDefaultUserSpendLimit).mockResolvedValueOnce(
        new Err(new DefaultUserSpendLimitError("metronome_error", "boom"))
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, { awuCredits: 1000 });

      expect(response.status).toBe(502);
    });
  });
});
