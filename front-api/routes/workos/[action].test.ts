import { getWorkOSSessionWithSetCookies } from "@app/lib/api/workos/user";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRevokeSession } = vi.hoisted(() => ({
  mockRevokeSession: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    userManagement: {
      revokeSession: mockRevokeSession,
    },
  }),
}));

function revokeSession(sessionId: string) {
  return honoApp.request("/api/workos/revoke-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

describe("POST /api/workos/revoke-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValueOnce({
      session: null,
      setCookies: [],
    });

    const response = await revokeSession("test-session-id");

    expect(response.status).toBe(401);
    expect(mockRevokeSession).not.toHaveBeenCalled();
  });

  it("rejects attempts to revoke another session", async () => {
    await createPrivateApiMockRequest({ method: "POST" });

    const response = await revokeSession("another-session-id");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Cannot revoke a session other than the authenticated one.",
      },
    });
    expect(mockRevokeSession).not.toHaveBeenCalled();
  });

  it("revokes the authenticated session", async () => {
    await createPrivateApiMockRequest({ method: "POST" });
    mockRevokeSession.mockResolvedValueOnce(undefined);

    const response = await revokeSession("test-session-id");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockRevokeSession).toHaveBeenCalledWith({
      sessionId: "test-session-id",
    });
  });
});
