import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

const { mockDeregisterMCPServer } = vi.hoisted(() => ({
  mockDeregisterMCPServer: vi.fn(),
}));

vi.mock("@app/lib/api/actions/mcp/client_side_registry", () => ({
  deregisterMCPServer: mockDeregisterMCPServer,
}));

import { honoApp } from "@front-api/app";

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace } = await createPrivateApiMockRequest({
    role,
    method: "POST",
  });
  return { workspace };
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/mcp/deregister`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/mcp/deregister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeregisterMCPServer.mockResolvedValue(undefined);
  });

  it("should deregister a server successfully", async () => {
    const { workspace } = await setup();
    const serverId = "test-server-id-123";

    const response = await post(workspace, { serverId });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockDeregisterMCPServer).toHaveBeenCalledWith(expect.anything(), {
      serverId,
    });
  });

  it("should return 400 when serverId is missing", async () => {
    const { workspace } = await setup();
    const response = await post(workspace, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("Invalid request body");
    expect(mockDeregisterMCPServer).not.toHaveBeenCalled();
  });

  it("should return 400 when serverId is not a string", async () => {
    const { workspace } = await setup();
    const response = await post(workspace, { serverId: 123 });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("Invalid request body");
    expect(mockDeregisterMCPServer).not.toHaveBeenCalled();
  });
});
