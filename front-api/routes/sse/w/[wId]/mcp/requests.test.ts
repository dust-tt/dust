import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import {
  emptyAsyncIterator,
  expectEmptySseStream,
} from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/actions/mcp/client_side_registry", () => ({
  validateMCPServerAccess: vi.fn(),
}));

vi.mock(
  import("@app/lib/api/assistant/mcp_events"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMCPEventsForServer: vi.fn(),
  })
);

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { getMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";

function getRequests(workspaceId: string, query: string) {
  return honoApp.request(`/api/sse/w/${workspaceId}/mcp/requests${query}`);
}

describe("GET /api/sse/w/[wId]/mcp/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when serverId query parameter is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await getRequests(workspace.sId, "");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({
        type: "invalid_request_error",
      }),
    });
  });

  it("returns 403 when MCP server access is denied", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    vi.mocked(validateMCPServerAccess).mockResolvedValue(false);

    const response = await getRequests(workspace.sId, "?serverId=srv_unknown");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({
        type: "mcp_auth_error",
      }),
    });
  });

  it("streams an SSE response when MCP server access is granted", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    vi.mocked(validateMCPServerAccess).mockResolvedValue(true);
    vi.mocked(getMCPEventsForServer).mockImplementation(emptyAsyncIterator);

    const response = await getRequests(workspace.sId, "?serverId=srv_ok");

    await expectEmptySseStream(response, { expectDoneSentinel: true });
  });
});
