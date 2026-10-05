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
    getMCPEventsBatch: vi.fn(),
  })
);

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  getMCPEventsBatch,
  getMCPEventsForServer,
} from "@app/lib/api/assistant/mcp_events";

describe.each([
  undefined,
  "sse",
  "poll",
])("MCP requests transport=%s", (transport) => {
  function getRequests(workspaceId: string, query: string) {
    const params = new URLSearchParams(query);
    if (transport) {
      params.set("transport", transport);
    }
    return honoApp.request(
      `/api/sse/w/${workspaceId}/mcp/requests?${params.toString()}`
    );
  }

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

  it("returns events when MCP server access is granted", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    vi.mocked(validateMCPServerAccess).mockResolvedValue(true);
    vi.mocked(getMCPEventsForServer).mockImplementation(emptyAsyncIterator);
    vi.mocked(getMCPEventsBatch).mockResolvedValue([]);

    const response = await getRequests(workspace.sId, "?serverId=srv_ok");

    if (transport === "poll") {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ events: [] });
    } else {
      await expectEmptySseStream(response, { expectDoneSentinel: true });
    }
  });
});

describe("browser MCP polling on the requests endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unsupported transport", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const response = await honoApp.request(
      `/api/sse/w/${workspace.sId}/mcp/requests?serverId=srv_ok&transport=unknown`
    );

    expect(response.status).toBe(400);
    expect(validateMCPServerAccess).not.toHaveBeenCalled();
  });

  it("returns serialized requests after the supplied cursor", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const event = {
      eventId: "2-0",
      data: { jsonrpc: "2.0" as const, id: "request", method: "tools/list" },
    };
    vi.mocked(validateMCPServerAccess).mockResolvedValue(true);
    vi.mocked(getMCPEventsBatch).mockResolvedValue([event]);

    const response = await honoApp.request(
      `/api/sse/w/${workspace.sId}/mcp/requests?serverId=srv_ok&transport=poll&lastEventId=1-0`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ events: [JSON.stringify(event)] });
    expect(getMCPEventsBatch).toHaveBeenCalledWith(
      expect.anything(),
      { mcpServerId: "srv_ok", lastEventId: "1-0" },
      expect.any(AbortSignal)
    );
    expect(getMCPEventsForServer).not.toHaveBeenCalled();
  });
});
