import { listDatabasesOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

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

function projectDatabasesUrl(workspaceId: string, projectId: string) {
  return `/api/poke/workspaces/${workspaceId}/projects/${projectId}/databases`;
}

function legacyPodDatabasesUrl(workspaceId: string, projectId: string) {
  return `/api/poke/workspaces/${workspaceId}/projects/${projectId}/pod-databases`;
}

describe("GET /api/poke/workspaces/:wId/projects/:projectId/databases", () => {
  it("returns the live databases owned by the project", async () => {
    const { workspace, space } = await setup();

    vi.mocked(listDatabasesOnSandbox).mockResolvedValue(
      new Ok([
        { name: "chat", sizeBytes: 8192 },
        { name: "notes", sizeBytes: 4096 },
      ])
    );

    const response = await honoApp.request(
      projectDatabasesUrl(workspace.sId, space.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toEqual([
      { name: "chat", sizeBytes: 8192 },
      { name: "notes", sizeBytes: 4096 },
    ]);
  });

  it("returns 500 when the project sandbox is unavailable", async () => {
    const { workspace, space } = await setup();

    vi.mocked(listDatabasesOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("sandbox_unavailable", "no sandbox"))
    );

    const response = await honoApp.request(
      projectDatabasesUrl(workspace.sId, space.sId)
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.type).toBe("internal_server_error");
  });

  it("keeps the legacy pod-databases route as an alias", async () => {
    const { workspace, space } = await setup();

    vi.mocked(listDatabasesOnSandbox).mockResolvedValue(
      new Ok([{ name: "chat", sizeBytes: 8192 }])
    );

    const response = await honoApp.request(
      legacyPodDatabasesUrl(workspace.sId, space.sId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ name: "chat", sizeBytes: 8192 }],
    });
  });
});
