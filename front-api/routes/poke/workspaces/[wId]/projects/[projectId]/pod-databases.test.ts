import { listDatabasesOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// Listing databases runs `dsbx db list` inside the pod sandbox.
vi.mock(import("@app/lib/api/sandbox_functions/dsbx_db"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    listDatabasesOnSandbox: vi.fn(),
  };
});

async function setup() {
  const { workspace } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });

  const space = await SpaceFactory.project(workspace);

  return { space, workspace };
}

function podDatabasesUrl(workspaceId: string, spaceId: string) {
  return `/api/poke/workspaces/${workspaceId}/projects/${spaceId}/pod-databases`;
}

describe("GET /api/poke/workspaces/:wId/projects/:projectId/pod-databases", () => {
  it("returns the live databases of the pod", async () => {
    const { workspace, space } = await setup();

    vi.mocked(listDatabasesOnSandbox).mockResolvedValue(
      new Ok([
        { name: "chat", sizeBytes: 8192 },
        { name: "notes", sizeBytes: 4096 },
      ])
    );

    const response = await honoApp.request(
      podDatabasesUrl(workspace.sId, space.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toEqual([
      { name: "chat", sizeBytes: 8192 },
      { name: "notes", sizeBytes: 4096 },
    ]);
  });

  it("returns 500 when the pod sandbox is unavailable", async () => {
    const { workspace, space } = await setup();

    vi.mocked(listDatabasesOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("sandbox_unavailable", "no sandbox"))
    );

    const response = await honoApp.request(
      podDatabasesUrl(workspace.sId, space.sId)
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.type).toBe("internal_server_error");
  });
});
