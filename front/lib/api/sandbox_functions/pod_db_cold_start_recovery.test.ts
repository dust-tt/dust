import {
  planPodDatabaseRecovery,
  recoverMissingPodDatabasesOnColdStart,
} from "@app/lib/api/sandbox_functions/pod_db_cold_start_recovery";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

const POD_ID = "vlt_test";
const POD_ROOT = `/files/pod-${POD_ID}`;

describe("planPodDatabaseRecovery", () => {
  it("plans app-prefixed recreates for missing databases only", () => {
    const findOutput = [
      `${POD_ROOT}/MyApp/databases/chat.db.ts`,
      `${POD_ROOT}/MyApp/databases/notes.db.ts`,
      `${POD_ROOT}/OtherApp/databases/chat.db.ts`,
    ].join("\n");

    const plan = planPodDatabaseRecovery({
      schemaFileFindOutput: findOutput,
      podId: POD_ID,
      // myapp__chat is live; the other two expected databases are not.
      liveNames: ["myapp__chat"],
    });

    expect(plan).toEqual([
      {
        database: "myapp__notes",
        schemaFileSandboxPath: `${POD_ROOT}/MyApp/databases/notes.db.ts`,
      },
      {
        database: "otherapp__chat",
        schemaFileSandboxPath: `${POD_ROOT}/OtherApp/databases/chat.db.ts`,
      },
    ]);
  });

  it("treats a legacy bare-named database as satisfying an app schema file", () => {
    const plan = planPodDatabaseRecovery({
      schemaFileFindOutput: `${POD_ROOT}/MyApp/databases/chat.db.ts`,
      podId: POD_ID,
      // Created before app namespacing: the bare file is the one db() opens.
      liveNames: ["chat"],
    });

    expect(plan).toEqual([]);
  });

  it("drops entries that do not match the documented layout or name contract", () => {
    const findOutput = [
      // Wrong shape: not under an app's databases/ folder.
      `${POD_ROOT}/databases/rootlevel.db.ts`,
      `${POD_ROOT}/MyApp/functions/chat.db.ts`,
      // Hostile or invalid database names.
      `${POD_ROOT}/MyApp/databases/Invalid-Name.db.ts`,
      `${POD_ROOT}/MyApp/databases/.hidden.db.ts`,
      // Outside the pod root entirely.
      `/files/pod-other/MyApp/databases/chat.db.ts`,
      // Valid.
      `${POD_ROOT}/MyApp/databases/chat.db.ts`,
      "",
      "  ",
    ].join("\n");

    const plan = planPodDatabaseRecovery({
      schemaFileFindOutput: findOutput,
      podId: POD_ID,
      liveNames: [],
    });

    expect(plan).toEqual([
      {
        database: "myapp__chat",
        schemaFileSandboxPath: `${POD_ROOT}/MyApp/databases/chat.db.ts`,
      },
    ]);
  });
});

describe("recoverMissingPodDatabasesOnColdStart", () => {
  async function setupSandbox() {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const sandbox = await SandboxResource.makeNew(authenticator, {
      providerId: "test-provider-id",
      status: "running",
      baseImage: "dust-base",
      version: "0.0.0-test",
    });
    return { authenticator, sandbox };
  }

  // Dispatch on the command: `dsbx db list`, the schema-file find, and `dsbx db reconcile`
  // are the three execs the recovery path can run.
  function mockRecoveryExecs(
    sandbox: SandboxResource,
    {
      liveNames,
      schemaFiles,
    }: { liveNames: string[]; schemaFiles: string[] }
  ) {
    return vi
      .spyOn(sandbox, "exec")
      .mockImplementation(async (_auth, command) => {
        if (command.includes("db list")) {
          return new Ok({
            exitCode: 0,
            stdout: `${JSON.stringify({
              ok: true,
              databases: liveNames.map((name) => ({ name, size_bytes: 1 })),
            })}\n`,
            stderr: "",
          });
        }
        if (command.startsWith("/usr/bin/find")) {
          return new Ok({
            exitCode: 0,
            stdout: `${schemaFiles.join("\n")}\n`,
            stderr: "",
          });
        }
        if (command.includes("db reconcile")) {
          return new Ok({
            exitCode: 0,
            stdout: `${JSON.stringify({ ok: true, created: true, statements: ["CREATE TABLE x (id integer)"] })}\n`,
            stderr: "",
          });
        }
        throw new Error(`Unexpected exec: ${command}`);
      });
  }

  it("reconciles each missing database and syncs the recreated file", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    const exec = mockRecoveryExecs(sandbox, {
      liveNames: [],
      schemaFiles: [`${POD_ROOT}/MyApp/databases/chat.db.ts`],
    });
    const execRoot = vi
      .spyOn(sandbox, "execRoot")
      .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" }));

    await recoverMissingPodDatabasesOnColdStart(authenticator, {
      sandbox,
      podId: POD_ID,
    });

    const reconcileCall = exec.mock.calls.find(([, command]) =>
      command.includes("db reconcile")
    );
    expect(reconcileCall).toBeDefined();
    expect(reconcileCall?.[1]).toContain(
      `db reconcile -- 'myapp__chat' '${POD_ROOT}/MyApp/databases/chat.db.ts'`
    );
    // The created database is synced to the replica (PR: sync-after-create).
    const syncCall = execRoot.mock.calls.find(([, command]) =>
      command.command.includes("litestream sync")
    );
    expect(syncCall).toBeDefined();
    expect(syncCall?.[1].command).toContain(
      "/pod-state/databases/myapp__chat.db"
    );
  });

  it("does nothing when every expected database is live", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    const exec = mockRecoveryExecs(sandbox, {
      liveNames: ["myapp__chat"],
      schemaFiles: [`${POD_ROOT}/MyApp/databases/chat.db.ts`],
    });
    const execRoot = vi.spyOn(sandbox, "execRoot");

    await recoverMissingPodDatabasesOnColdStart(authenticator, {
      sandbox,
      podId: POD_ID,
    });

    expect(
      exec.mock.calls.some(([, command]) => command.includes("db reconcile"))
    ).toBe(false);
    expect(execRoot).not.toHaveBeenCalled();
  });

  it("never fails the cold start when enumeration errors", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 1, stdout: "", stderr: "boom" })
    );

    await expect(
      recoverMissingPodDatabasesOnColdStart(authenticator, {
        sandbox,
        podId: POD_ID,
      })
    ).resolves.toBeUndefined();
  });
});
