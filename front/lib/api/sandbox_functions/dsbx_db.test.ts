import { createHash } from "node:crypto";

import { syncPodDatabaseAfterCreate } from "@app/lib/api/sandbox/db";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import {
  getDatabaseSchemaOnSandbox,
  listDatabasesOnSandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { reconcileDatabaseOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db_on_sandbox";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

vi.mock(import("@app/lib/api/sandbox/db"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, syncPodDatabaseAfterCreate: vi.fn() };
});

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

describe("reconcileDatabaseOnSandbox", () => {
  const reconcileArgs = {
    database: "myapp__chat",
    schemaFileSandboxPath: "/files/pod-x/MyApp/databases/chat.db.ts",
  };

  function mockReconcileExec(
    sandbox: SandboxResource,
    { created }: { created: boolean }
  ) {
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: `${JSON.stringify({ ok: true, created, statements: [] })}\n`,
        stderr: "",
      })
    );
  }

  it("waits for the first replication sync when the database was created", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockReconcileExec(sandbox, { created: true });
    vi.mocked(syncPodDatabaseAfterCreate).mockResolvedValue(new Ok(undefined));

    const result = await reconcileDatabaseOnSandbox(authenticator, {
      sandbox,
      podId: space.sId,
      ...reconcileArgs,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.created).toBe(true);
    expect(result.value.replicationWarning).toBeUndefined();
    expect(syncPodDatabaseAfterCreate).toHaveBeenCalledTimes(1);
    expect(syncPodDatabaseAfterCreate).toHaveBeenCalledWith(
      authenticator,
      sandbox,
      "myapp__chat"
    );
  });

  it("reports a replication warning when the first sync cannot be confirmed", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockReconcileExec(sandbox, { created: true });
    vi.mocked(syncPodDatabaseAfterCreate).mockResolvedValue(
      new Err(new Error("daemon socket unavailable"))
    );

    const result = await reconcileDatabaseOnSandbox(authenticator, {
      sandbox,
      podId: space.sId,
      ...reconcileArgs,
    });

    // The DDL applied and reconcile is idempotent, so the reconcile still
    // succeeds — but the caller is told durability is not confirmed yet.
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.replicationWarning).toContain(
      "first replication sync could not be confirmed"
    );
  });

  it("does not sync when the database already existed", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockReconcileExec(sandbox, { created: false });

    const result = await reconcileDatabaseOnSandbox(authenticator, {
      sandbox,
      podId: space.sId,
      ...reconcileArgs,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.replicationWarning).toBeUndefined();
    expect(syncPodDatabaseAfterCreate).not.toHaveBeenCalled();
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
