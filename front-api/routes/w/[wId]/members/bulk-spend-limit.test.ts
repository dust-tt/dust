import { UserResource } from "@app/lib/resources/user_resource";
import * as bulkClient from "@app/temporal/bulk_spend_limit/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/bulk_spend_limit/client", () => ({
  runBulkSetUserSpendLimitWorkflow: vi.fn(),
}));

function bulkSpendLimitUrl(wId: string) {
  return `/api/w/${wId}/members/bulk-spend-limit`;
}

async function makeMetronomeWorkspace(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({ metronomeCustomerId: "cust_test_bulk" });
}

function post(wId: string, body: unknown) {
  return honoApp.request(bulkSpendLimitUrl(wId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(bulkClient.runBulkSetUserSpendLimitWorkflow).mockResolvedValue(
    new Ok({ workflowId: "wf_test_bulk" })
  );
  // The workspace-scoped search that validates membership. Default to "no
  // match"; tests that need members override with real UserFactory users.
  vi.spyOn(UserResource, "searchAllUsers").mockResolvedValue(
    new Ok({ users: [], total: 0 })
  );
});

describe("POST /api/w/[wId]/members/bulk-spend-limit", () => {
  it("returns 403 when the caller is a user", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
      workspace,
    });

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["u1"] },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).not.toHaveBeenCalled();
  });

  it("allows a business admin to launch the workflow", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "business_admin",
      workspace,
    });

    const member = await UserFactory.basic();
    vi.mocked(UserResource.searchAllUsers).mockResolvedValue(
      new Ok({ users: [member], total: 1 })
    );

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: [member.sId] },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workflowId: "wf_test_bulk",
      memberCount: 1,
    });
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).toHaveBeenCalled();
  });

  it("returns 403 when the workspace is not on Metronome billing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["u1"] },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("plan_limit_error");
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when the explicit selection is empty", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: [] },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(400);
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when awuCredits is out of range", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["u1"] },
      limit: { kind: "limited", awuCredits: -1 },
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("launches the workflow with the de-duplicated, validated member ids", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });

    const member1 = await UserFactory.basic();
    const member2 = await UserFactory.basic();
    vi.mocked(UserResource.searchAllUsers).mockResolvedValue(
      new Ok({ users: [member1, member2], total: 2 })
    );

    const response = await post(workspace.sId, {
      selection: {
        mode: "ids",
        userIds: [member1.sId, member2.sId, member2.sId],
      },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workflowId: "wf_test_bulk",
      memberCount: 2,
    });
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.sId,
        userIds: [member1.sId, member2.sId],
        limit: { kind: "limited", awuCredits: 1000 },
      })
    );
  });

  it("returns 400 when no submitted ids are active members", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    // None of the submitted ids resolve to an active member.
    vi.mocked(UserResource.searchAllUsers).mockResolvedValue(
      new Ok({ users: [], total: 0 })
    );

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["stale1", "stale2"] },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).not.toHaveBeenCalled();
  });

  it("returns 500 when member resolution fails (e.g. search outage)", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    vi.mocked(UserResource.searchAllUsers).mockResolvedValue(
      new Err(new Error("search unavailable"))
    );

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["u1"] },
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(response.status).toBe(500);
    expect(bulkClient.runBulkSetUserSpendLimitWorkflow).not.toHaveBeenCalled();
  });
});
