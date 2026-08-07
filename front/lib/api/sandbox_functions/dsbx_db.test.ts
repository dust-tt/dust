import { createHash } from "node:crypto";

import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import {
  buildTableRowCountsQuery,
  getDatabaseSchemaOnSandbox,
  listDatabasesOnSandbox,
  quoteSqliteIdentifier,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { RESERVED_TABLE_PREFIXES } from "@app/types/api/sandbox_functions";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RESERVED_TABLE_PREFIXES as RUNNER_RESERVED_TABLE_PREFIXES } from "../../../../cli/dust-sandbox/functions-runner/types/db";

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

describe("quoteSqliteIdentifier", () => {
  it("wraps a plain name in double quotes", () => {
    expect(quoteSqliteIdentifier("messages")).toBe('"messages"');
  });

  it("escapes an embedded double quote by doubling it", () => {
    expect(quoteSqliteIdentifier('we"ird')).toBe('"we""ird"');
  });

  it("keeps a statement-terminating name inside the quoted identifier", () => {
    // A table named this way can only come from `sqlite_master`, but it must stay one identifier.
    expect(quoteSqliteIdentifier('a"; DROP TABLE users; --')).toBe(
      '"a""; DROP TABLE users; --"'
    );
  });
});

describe("buildTableRowCountsQuery", () => {
  it("counts a single table", () => {
    expect(buildTableRowCountsQuery(["messages"])).toBe(
      'SELECT 0 AS idx, COUNT(*) AS row_count FROM "messages" ORDER BY idx'
    );
  });

  it("addresses tables by index so no name is ever a SQL literal", () => {
    const sql = buildTableRowCountsQuery(["messages", "threads"]);

    expect(sql).toBe(
      'SELECT 0 AS idx, COUNT(*) AS row_count FROM "messages" UNION ALL ' +
        'SELECT 1 AS idx, COUNT(*) AS row_count FROM "threads" ORDER BY idx'
    );
    expect(sql).not.toContain("'");
  });

  it("quotes hostile table names rather than interpolating them raw", () => {
    const sql = buildTableRowCountsQuery(['a" UNION SELECT 1, 1 --']);

    expect(sql).toContain('FROM "a"" UNION SELECT 1, 1 --"');
  });
});

// Table enumeration hides these prefixes; the runner refuses to let a pod schema claim them.
// Front cannot runtime-import cli code, so the mirrored copy's equality is asserted here.
describe("RESERVED_TABLE_PREFIXES", () => {
  it("stays identical to the runner's list", () => {
    expect(RESERVED_TABLE_PREFIXES).toEqual(RUNNER_RESERVED_TABLE_PREFIXES);
  });
});
