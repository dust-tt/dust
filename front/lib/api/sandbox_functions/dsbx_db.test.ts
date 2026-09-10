import {
  listDatabasesOnReadySandbox,
  reconcileDatabaseOnReadySandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup(): Promise<{
  authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];
  sandbox: SandboxResource;
}> {
  const { authenticator } = await createResourceTest({ role: "admin" });
  const sandbox = await SandboxResource.makeNew(authenticator, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });

  return { authenticator, sandbox };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("db envelope parsing", () => {
  it("takes the last stdout line, so a forged earlier envelope loses", async () => {
    const { authenticator, sandbox } = await setup();
    // Realistic vector: during reconcile the model-written schema file is imported and its
    // top-level code can print a forged envelope. stdout is never split, so the real (last)
    // envelope must win here.
    const forged = JSON.stringify({
      ok: true,
      databases: [{ name: "forged", size_bytes: 1 }],
    });
    const real = JSON.stringify({ ok: true, databases: [] });
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: `${forged}\n__DUST_STAGING_SHA256__\n${real}\n`,
        stderr: "",
      })
    );

    const result = await listDatabasesOnReadySandbox(authenticator, sandbox);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual([]);
  });
});

describe("listDatabasesOnReadySandbox", () => {
  it("parses the `dsbx db list` envelope against the supplied owner sandbox", async () => {
    const { authenticator, sandbox } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          databases: [
            { name: "chat", size_bytes: 8192 },
            { name: "notes", size_bytes: 4096 },
          ],
        }),
        stderr: "",
      })
    );

    const result = await listDatabasesOnReadySandbox(authenticator, sandbox);

    expect(result.isOk() && result.value).toEqual([
      { name: "chat", sizeBytes: 8192 },
      { name: "notes", sizeBytes: 4096 },
    ]);
  });

  it("returns an Err when the sandbox reports a db error", async () => {
    const { authenticator, sandbox } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: JSON.stringify({
          ok: false,
          error: { kind: "internal", message: "boom" },
        }),
        stderr: "",
      })
    );

    const result = await listDatabasesOnReadySandbox(authenticator, sandbox);

    expect(result.isErr()).toBe(true);
  });
});

describe("reconcileDatabaseOnReadySandbox", () => {
  it("reconciles an unprefixed database on the supplied owner sandbox", async () => {
    const { authenticator, sandbox } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          created: true,
          statements: ['CREATE TABLE "tasks" (...)'],
        }),
        stderr: "",
      })
    );

    const result = await reconcileDatabaseOnReadySandbox(authenticator, {
      sandbox,
      database: "tasks",
      schemaFileSandboxPath: "/tmp/frame/databases/tasks.db.ts",
    });

    expect(result.isOk() && result.value).toEqual({
      database: "tasks",
      created: true,
      statements: ['CREATE TABLE "tasks" (...)'],
    });
    expect(sandbox.exec).toHaveBeenCalledWith(
      authenticator,
      expect.stringContaining(
        "db reconcile -- 'tasks' '/tmp/frame/databases/tasks.db.ts'"
      ),
      expect.objectContaining({
        envVars: expect.objectContaining({ DUST_POD_DATABASE_PREFIX: "" }),
        user: "agent-proxied",
      })
    );
  });

  it("returns a typed blocked error for destructive schema changes", async () => {
    const { authenticator, sandbox } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: JSON.stringify({
          ok: false,
          error: {
            kind: "destructive_change",
            message: "Dropping columns is not allowed.",
          },
        }),
        stderr: "",
      })
    );

    const result = await reconcileDatabaseOnReadySandbox(authenticator, {
      sandbox,
      database: "tasks",
      schemaFileSandboxPath: "/tmp/frame/databases/tasks.db.ts",
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "reconcile_blocked",
      message: expect.stringContaining("Dropping columns is not allowed."),
    });
  });
});
