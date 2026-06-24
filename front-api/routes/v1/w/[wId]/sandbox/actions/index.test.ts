import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSandboxActions(workspace: { sId: string }, token: string) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/sandbox/actions`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/v1/w/[wId]/sandbox/actions", () => {
  it("returns 403 when sandbox tools are not enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext();

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Sandbox tools are not enabled for this workspace.",
      },
    });
  });

  it("returns 403 when Computer is disabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
      disableComputerFeature: true,
    });

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Sandbox tools are not enabled for this workspace.",
      },
    });
  });

  it("returns server views when sandbox tools are enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
    });

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    // The conversation's JIT servers resolve to auto MCP server views, which
    // are hydrated just in time on first read.
    expect(body.serverViews.length).toBeGreaterThan(0);
    for (const serverView of body.serverViews) {
      expect(serverView.server.availability).not.toBe("manual");
    }
  });
});
