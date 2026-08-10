import {
  listDatabasesOnSandbox,
  listTablesOnSandbox,
  queryDatabaseOnSandbox,
  readTableRowsOnSandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every route here shells out to `dsbx db ...` in a live pod sandbox; the sandbox layer is the
// boundary being stubbed, so the tests exercise routing, gating and payload shaping.
vi.mock("@app/lib/api/sandbox_functions/dsbx_db", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/dsbx_db")
    >();
  return {
    ...original,
    listDatabasesOnSandbox: vi.fn(),
    listTablesOnSandbox: vi.fn(),
    readTableRowsOnSandbox: vi.fn(),
    queryDatabaseOnSandbox: vi.fn(),
  };
});

const mockedListDatabases = vi.mocked(listDatabasesOnSandbox);
const mockedListTables = vi.mocked(listTablesOnSandbox);
const mockedReadRows = vi.mocked(readTableRowsOnSandbox);
const mockedQuery = vi.mocked(queryDatabaseOnSandbox);

async function setupTest({
  role = "admin",
  enableSandboxFunctions = true,
}: {
  role?: MembershipRoleType;
  enableSandboxFunctions?: boolean;
} = {}) {
  const { workspace, auth, user, globalSpace } =
    await createPrivateApiMockRequest({ role });

  if (enableSandboxFunctions) {
    await FeatureFlagFactory.basic(auth, "sandbox_functions");
  }

  // The routes require canRead AND canAdministrate, which on a restricted pod only its editors
  // hold — so the caller is the pod's editor unless a test builds its own pod.
  const pod = await SpaceFactory.project(workspace, user.id);

  return { workspace, auth, user, pod, globalSpace };
}

function databasesUrl(wId: string, spaceId: string, path = "") {
  return `/api/w/${wId}/spaces/${spaceId}/databases${path}`;
}

describe("/api/w/:wId/spaces/:spaceId/databases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the pod's live databases", async () => {
    const { workspace, pod } = await setupTest();
    mockedListDatabases.mockResolvedValue(
      new Ok([{ name: "chat", sizeBytes: 12648 }])
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      databases: [{ name: "chat", sizeBytes: 12648 }],
    });
  });

  it("lists a database's tables with their row counts", async () => {
    const { workspace, pod } = await setupTest();
    mockedListTables.mockResolvedValue(
      new Ok([{ name: "messages", rowCount: 1204 }])
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId, "/chat/tables")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tables: [{ name: "messages", rowCount: 1204 }],
    });
    expect(mockedListTables).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ database: "chat" })
    );
  });

  it("reads a page of table rows", async () => {
    const { workspace, pod } = await setupTest();
    mockedReadRows.mockResolvedValue(
      new Ok({
        columns: ["id", "role"],
        rows: [{ id: 1, role: "user" }],
        hasMore: true,
      })
    );

    const response = await honoApp.request(
      databasesUrl(
        workspace.sId,
        pod.sId,
        "/chat/tables/messages/rows?limit=1&offset=10"
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      columns: ["id", "role"],
      rows: [{ id: 1, role: "user" }],
      hasMore: true,
    });
    expect(mockedReadRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ table: "messages", limit: 1, offset: 10 })
    );
  });

  it("rejects a page size above the browse cap", async () => {
    const { workspace, pod } = await setupTest();

    const response = await honoApp.request(
      databasesUrl(
        workspace.sId,
        pod.sId,
        "/chat/tables/messages/rows?limit=5000"
      )
    );

    expect(response.status).toBe(400);
    expect(mockedReadRows).not.toHaveBeenCalled();
  });

  it("runs a SQL statement sent in the body", async () => {
    const { workspace, pod } = await setupTest();
    mockedQuery.mockResolvedValue(
      new Ok({
        columns: ["id"],
        rows: [{ id: 1 }],
        rowCount: 1,
        changes: null,
        resultsFile: null,
        note: null,
      })
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId, "/chat/query"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "select id from messages" }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      columns: ["id"],
      rows: [{ id: 1 }],
      rowCount: 1,
      changes: null,
      note: null,
    });
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sql: "select id from messages" })
    );
  });

  it("returns 400 with the runner's message when a statement is refused", async () => {
    const { workspace, pod } = await setupTest();
    mockedQuery.mockResolvedValue(
      new Err(
        new SandboxFunctionError(
          "reconcile_blocked",
          "DDL is forbidden in query mode"
        )
      )
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId, "/chat/query"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "drop table messages" }),
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
        message: "DDL is forbidden in query mode",
      },
    });
  });

  it("returns 503 when the pod sandbox cannot be reached", async () => {
    const { workspace, pod } = await setupTest();
    mockedListDatabases.mockResolvedValue(
      new Err(new SandboxFunctionError("sandbox_unavailable", "no sandbox"))
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId)
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { type: "service_unavailable" },
    });
  });

  it("returns 404 for a table the database does not have", async () => {
    const { workspace, pod } = await setupTest();
    mockedReadRows.mockResolvedValue(
      new Err(new SandboxFunctionError("not_found", "no such table"))
    );

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId, "/chat/tables/ghosts/rows")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "table_not_found" },
    });
  });

  it("rejects a database name outside the pod database name shape", async () => {
    const { workspace, pod } = await setupTest();

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId, "/Chat-1/tables")
    );

    expect(response.status).toBe(400);
    expect(mockedListTables).not.toHaveBeenCalled();
  });

  it("serves a pod editor who is not a workspace admin", async () => {
    const { workspace, pod } = await setupTest({ role: "user" });
    mockedListDatabases.mockResolvedValue(new Ok([]));

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId)
    );

    expect(response.status).toBe(200);
  });

  it("hides a restricted pod's databases from a user who does not edit it", async () => {
    const { workspace } = await setupTest({ role: "user" });
    const otherPod = await SpaceFactory.project(workspace);

    const response = await honoApp.request(
      databasesUrl(workspace.sId, otherPod.sId)
    );

    expect(response.status).toBe(404);
    expect(mockedListDatabases).not.toHaveBeenCalled();
  });

  // A workspace admin holds "admin" on every project but not "read" on a restricted one, so the
  // canRead half of the gate keeps them out — matching Files, Tasks and project context.
  it("hides a restricted pod's databases from a non-member workspace admin", async () => {
    const { workspace } = await setupTest({ role: "admin" });
    const otherPod = await SpaceFactory.project(workspace);

    const response = await honoApp.request(
      databasesUrl(workspace.sId, otherPod.sId)
    );

    expect(response.status).toBe(404);
    expect(mockedListDatabases).not.toHaveBeenCalled();
  });

  it("rejects workspaces without the sandbox_functions flag with a 403", async () => {
    const { workspace, pod } = await setupTest({
      enableSandboxFunctions: false,
    });

    const response = await honoApp.request(
      databasesUrl(workspace.sId, pod.sId)
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  // A readable non-project space, so the isProject guard is what answers rather than the
  // permission gate (a restricted regular space would 404 before reaching it).
  it("returns 400 for non-project spaces", async () => {
    const { workspace, globalSpace } = await setupTest();

    const response = await honoApp.request(
      databasesUrl(workspace.sId, globalSpace.sId)
    );

    expect(response.status).toBe(400);
    expect(mockedListDatabases).not.toHaveBeenCalled();
  });
});
