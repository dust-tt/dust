import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { listDatabasesOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Listing databases wakes the Frame sandbox and runs `dsbx db list` inside it.
vi.mock(import("@app/lib/api/sandbox_functions/dsbx_db"), async (orig) => {
  const mod = await orig();
  return { ...mod, listDatabasesOnReadySandbox: vi.fn() };
});
vi.mock(import("@app/lib/api/sandbox/lifecycle"), async (orig) => {
  const mod = await orig();
  return { ...mod, ensureFrameSandboxReady: vi.fn() };
});

function databasesUrl(workspaceId: string, frameId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/databases`;
}

describe("GET /api/poke/workspaces/:wId/frames/:frameId/databases", () => {
  // Both mocks are module-scoped: without this, a return value set in one test would leak into
  // the next test's assertions.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the live databases of the Frame", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({ sandbox: {} } as never)
    );
    vi.mocked(listDatabasesOnReadySandbox).mockResolvedValue(
      new Ok([{ name: "chat", sizeBytes: 8192 }])
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, frame.sId)
    );

    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([
      { name: "chat", sizeBytes: 8192 },
    ]);
  });

  it("returns 500 when the Frame sandbox is unavailable", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Err(new Error("no sandbox"))
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, frame.sId)
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.type).toBe("internal_server_error");
  });

  it("returns 500 when `dsbx db list` fails", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({ sandbox: {} } as never)
    );
    vi.mocked(listDatabasesOnReadySandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("internal", "boom"))
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, frame.sId)
    );

    expect(response.status).toBe(500);
  });
});
