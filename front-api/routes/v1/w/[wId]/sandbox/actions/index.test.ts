import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSandboxActions(workspace: { sId: string }, token: string) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/sandbox/actions`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/v1/w/[wId]/sandbox/actions", () => {
  it("returns 403 when dsbx tools are not enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
    });

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Sandbox dsbx tools are not enabled for this workspace.",
      },
    });
  });

  it("returns server views when both sandbox flags are enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
      enableDsbxTools: true,
    });

    const response = await getSandboxActions(workspace, token);

    expect(await response.json()).toEqual({ serverViews: [] });
    expect(response.status).toBe(200);
  });
});
