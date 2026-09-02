import { createHash } from "node:crypto";

import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import {
  getDatabaseSchemaOnSandbox,
  listDatabasesOnReadySandbox,
  listDatabasesOnSandbox,
  reconcileDatabaseOnReadySandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

const sha256Hex = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

const SCHEMA_CONTENT = 'export const secAudit = sqliteTable("sec_audit", {});';

async function setup(): Promise<{
  authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];
  sandbox: SandboxResource;
  space: SpaceResource;
}> {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const sandbox = await SandboxResource.makeNew(authenticator, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.mocked(ensurePodSandboxReady).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false })
  );

  return { authenticator, sandbox, space };
}

function mockExecWithSchemaHash(
  sandbox: SandboxResource,
  schemaContent: string
) {
  return vi
    .spyOn(sandbox, "exec")
    .mockImplementation(async (_auth, command) => {
      // The staging path is shell-quoted in the command; strip the quotes.
      const match = /'?(\/[\w./-]+\.db\.ts)'?/.exec(command);
      const outPath = match ? match[1] : "";
      return new Ok({
        exitCode: 0,
        stdout: `${JSON.stringify({ ok: true })}\n__DUST_STAGING_SHA256__\n${sha256Hex(schemaContent)}  ${outPath}\n`,
        stderr: "",
      });
    });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDatabaseSchemaOnSandbox", () => {
  it("returns the schema file content when the hash matches", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockExecWithSchemaHash(sandbox, SCHEMA_CONTENT);
    vi.spyOn(sandbox, "readFile").mockResolvedValue(
      new Ok(Buffer.from(SCHEMA_CONTENT))
    );

    const result = await getDatabaseSchemaOnSandbox(authenticator, {
      space,
      database: "sec_audit",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toBe(SCHEMA_CONTENT);
  });

  it("refuses a staging file swapped between the exec and the read-back", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockExecWithSchemaHash(sandbox, SCHEMA_CONTENT);
    vi.spyOn(sandbox, "readFile").mockResolvedValue(
      new Ok(Buffer.from('{"name":"CTF","value":"root-only-content"}'))
    );

    const result = await getDatabaseSchemaOnSandbox(authenticator, {
      space,
      database: "sec_audit",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).toContain(
      "changed between production and read-back"
    );
    expect(result.error.message).not.toContain("root-only-content");
  });

  it("fails closed when the exec output carries no integrity hash", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: JSON.stringify({ ok: true }), stderr: "" })
    );
    vi.spyOn(sandbox, "readFile").mockResolvedValue(
      new Ok(Buffer.from(SCHEMA_CONTENT))
    );

    const result = await getDatabaseSchemaOnSandbox(authenticator, {
      space,
      database: "sec_audit",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).toContain("Missing integrity hash");
  });
});

describe("non-staging db commands", () => {
  it("does not split stdout on a forged marker, so the real envelope stays last", async () => {
    const { authenticator, sandbox, space } = await setup();
    // Realistic vector: during reconcile the model-written schema file is imported and its
    // top-level code can print a forged envelope followed by a marker line. Only staging
    // execs opt into the marker split, so the real (last) envelope must win here.
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

    const result = await listDatabasesOnSandbox(authenticator, { space });

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
