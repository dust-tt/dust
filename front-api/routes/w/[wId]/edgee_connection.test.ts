import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { InMemoryOAuthAPI } from "@app/tests/utils/mocks/in_memory_oauth_api";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckEdgeeOrganizationAccess = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/edgee/console_client", () => ({
  checkEdgeeOrganizationAccess: mockCheckEdgeeOrganizationAccess,
  createEdgeeGatewayApiKey: vi.fn(),
  deleteEdgeeGatewayApiKey: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { InMemoryOAuthAPI } =
    await import("@app/tests/utils/mocks/in_memory_oauth_api");
  return { ...actual, OAuthAPI: InMemoryOAuthAPI };
});

function putConnection(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/edgee_connection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/w/:wId/edgee_connection", () => {
  beforeEach(() => {
    InMemoryOAuthAPI.reset();
    mockCheckEdgeeOrganizationAccess.mockReset();
    mockCheckEdgeeOrganizationAccess.mockResolvedValue(new Ok(undefined));
  });

  it("lets an admin save the connection and read it back without the token", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      plan: "edgee",
    });

    const putRes = await putConnection(workspace.sId, {
      adminToken: "pat-secret",
      organizationId: "org_1",
    });
    expect(putRes.status).toBe(200);

    const getRes = await honoApp.request(
      `/api/w/${workspace.sId}/edgee_connection`
    );
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.connection.organizationId).toBe("org_1");
    expect(JSON.stringify(body)).not.toContain("pat-secret");
  });

  it("answers 400 when Edgee refuses the admin token", async () => {
    mockCheckEdgeeOrganizationAccess.mockResolvedValue(
      new Err(new Error("status 403"))
    );
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      plan: "edgee",
    });

    const res = await putConnection(workspace.sId, {
      adminToken: "pat",
      organizationId: "org_1",
    });

    expect(res.status).toBe(400);
  });

  it("refuses non-admins", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
      plan: "edgee",
    });

    const res = await putConnection(workspace.sId, {
      adminToken: "pat",
      organizationId: "org_1",
    });

    expect(res.status).toBe(403);
  });

  it("refuses workspaces whose plan is not routed through Edgee", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await putConnection(workspace.sId, {
      adminToken: "pat",
      organizationId: "org_1",
    });

    expect(res.status).toBe(403);
  });

  it("removes the connection", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      plan: "edgee",
    });
    await putConnection(workspace.sId, {
      adminToken: "pat",
      organizationId: "org_1",
    });

    const deleteRes = await honoApp.request(
      `/api/w/${workspace.sId}/edgee_connection`,
      { method: "DELETE" }
    );
    expect(deleteRes.status).toBe(204);

    const getRes = await honoApp.request(
      `/api/w/${workspace.sId}/edgee_connection`
    );
    expect((await getRes.json()).connection).toBeNull();
  });
});
