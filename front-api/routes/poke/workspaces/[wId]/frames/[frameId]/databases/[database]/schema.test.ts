import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { getDatabaseSchemaOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regenerating a schema wakes the Frame sandbox and runs `dsbx db schema` inside it.
vi.mock(import("@app/lib/api/sandbox_functions/dsbx_db"), async (orig) => {
  const mod = await orig();
  return { ...mod, getDatabaseSchemaOnReadySandbox: vi.fn() };
});
vi.mock(import("@app/lib/api/sandbox/lifecycle"), async (orig) => {
  const mod = await orig();
  return { ...mod, ensureFrameSandboxReady: vi.fn() };
});

function schemaUrl(workspaceId: string, frameId: string, database: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/databases/${database}/schema`;
}

const SCHEMA = 'export const todos = sqliteTable("todos", { id: integer() });';

describe("GET .../frames/:frameId/databases/:database/schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the regenerated schema for the named database", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({ sandbox: {} } as never)
    );
    vi.mocked(getDatabaseSchemaOnReadySandbox).mockResolvedValue(
      new Ok(SCHEMA)
    );

    const response = await honoApp.request(
      schemaUrl(workspace.sId, frame.sId, "todos")
    );

    expect(response.status).toBe(200);
    expect((await response.json()).schema).toBe(SCHEMA);
    expect(getDatabaseSchemaOnReadySandbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ database: "todos" })
    );
  });

  it("rejects a database name the manifest would not accept", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const response = await honoApp.request(
      schemaUrl(workspace.sId, frame.sId, "not..a..name")
    );

    expect(response.status).toBe(400);
    // The name reaches a sandbox command, so it must be rejected before the sandbox is woken.
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("returns 500 when the Frame sandbox is unavailable", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Err(new Error("no sandbox"))
    );

    const response = await honoApp.request(
      schemaUrl(workspace.sId, frame.sId, "todos")
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when `dsbx db schema` fails", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({ sandbox: {} } as never)
    );
    vi.mocked(getDatabaseSchemaOnReadySandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("internal", "boom"))
    );

    const response = await honoApp.request(
      schemaUrl(workspace.sId, frame.sId, "todos")
    );

    expect(response.status).toBe(500);
  });
});
