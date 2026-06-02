import * as businessLayer from "@app/lib/api/credits/programmatic_usage_limit";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/credits/programmatic_usage_limit", async () => {
  const actual = await vi.importActual<typeof businessLayer>(
    "@app/lib/api/credits/programmatic_usage_limit"
  );
  return {
    ...actual,
    getProgrammaticUsageLimit: vi.fn(),
    syncProgrammaticUsageLimit: vi.fn(),
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
    `/api/w/${wId}/usage_settings/programmatic_usage_limit`
  );
}

function putRequest(wId: string, body: Record<string, unknown>) {
  return honoApp.request(
    `/api/w/${wId}/usage_settings/programmatic_usage_limit`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.mocked(businessLayer.getProgrammaticUsageLimit).mockResolvedValue(
    new Ok(500)
  );
  vi.mocked(businessLayer.syncProgrammaticUsageLimit).mockResolvedValue(
    new Ok(undefined)
  );
});

describe("/api/w/[wId]/usage_settings/programmatic_usage_limit", () => {
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
  });

  describe("method validation", () => {
    it("returns 404 for unsupported methods", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        `/api/w/${workspace.sId}/usage_settings/programmatic_usage_limit`,
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
    it("returns the configured cap", async () => {
      vi.mocked(businessLayer.getProgrammaticUsageLimit).mockResolvedValueOnce(
        new Ok(1000)
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ monthlyCapCredits: 1000 });
    });

    it("returns null when no cap is configured", async () => {
      vi.mocked(businessLayer.getProgrammaticUsageLimit).mockResolvedValueOnce(
        new Ok(null)
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ monthlyCapCredits: null });
    });

    it("returns 500 on business layer error", async () => {
      vi.mocked(businessLayer.getProgrammaticUsageLimit).mockResolvedValueOnce(
        new Err(new Error("boom"))
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await getRequest(workspace.sId);

      expect(response.status).toBe(500);
    });
  });

  describe("PUT", () => {
    it("sets the cap and returns the new value", async () => {
      vi.mocked(businessLayer.syncProgrammaticUsageLimit).mockResolvedValueOnce(
        new Ok(undefined)
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        monthlyCapCredits: 500,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ monthlyCapCredits: 500 });
      expect(businessLayer.syncProgrammaticUsageLimit).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyCapCredits: 500 })
      );
    });

    it("clears the cap when null is passed", async () => {
      vi.mocked(businessLayer.syncProgrammaticUsageLimit).mockResolvedValueOnce(
        new Ok(undefined)
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        monthlyCapCredits: null,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ monthlyCapCredits: null });
      expect(businessLayer.syncProgrammaticUsageLimit).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyCapCredits: null })
      );
    });

    it("returns 400 when monthlyCapCredits is missing", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {});

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: { type: string } };
      expect(data.error.type).toBe("invalid_request_error");
      expect(businessLayer.syncProgrammaticUsageLimit).not.toHaveBeenCalled();
    });

    it("accepts monthlyCapCredits of zero", async () => {
      vi.mocked(businessLayer.syncProgrammaticUsageLimit).mockResolvedValueOnce(
        new Ok(undefined)
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        monthlyCapCredits: 0,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ monthlyCapCredits: 0 });
    });

    it("returns 400 when monthlyCapCredits is negative", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        monthlyCapCredits: -10,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when monthlyCapCredits is non-integer", async () => {
      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        monthlyCapCredits: 1.5,
      });

      expect(response.status).toBe(400);
    });

    it("returns 500 when the business layer fails", async () => {
      vi.mocked(businessLayer.syncProgrammaticUsageLimit).mockResolvedValueOnce(
        new Err(new Error("metronome down"))
      );

      const workspace = await makeMetronomeWorkspace();
      await createPrivateApiMockRequest({
        role: "admin",
        workspace,
      });

      const response = await putRequest(workspace.sId, {
        monthlyCapCredits: 500,
      });

      expect(response.status).toBe(500);
    });
  });
});
