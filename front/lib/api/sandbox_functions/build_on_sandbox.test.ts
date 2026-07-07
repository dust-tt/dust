import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

const SRC = "/files/pod-spc123/greet.ts";

const okEnvelope = JSON.stringify({ ok: true });

const validSchemaFile = JSON.stringify({
  name: "greet",
  description: "Greet someone.",
  input_schema: { type: "object", properties: { name: { type: "string" } } },
  output_schema: {
    type: "object",
    properties: { greeting: { type: "string" } },
  },
});

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSandboxFunctionOnSandbox", () => {
  it("builds the bundle and returns the extracted contract", async () => {
    const { authenticator, sandbox, space } = await setup();
    const execSpy = vi
      .spyOn(sandbox, "exec")
      .mockResolvedValue(
        new Ok({ exitCode: 0, stdout: okEnvelope, stderr: "" })
      );
    const readSpy = vi
      .spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(
        new Ok(Buffer.from("export default {/*bundle*/};"))
      )
      .mockResolvedValueOnce(new Ok(Buffer.from(validSchemaFile)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.bundleCode).toBe("export default {/*bundle*/};");
    expect(result.value.inputSchema).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect(result.value.outputSchema).toEqual({
      type: "object",
      properties: { greeting: { type: "string" } },
    });
    // No `databases` field in the schema file -> no manifests.
    expect(result.value.manifests).toBeNull();

    // Command shape: absolute dsbx, build subcommand, `--` then the escaped source path, and the
    // egress-controlled user.
    expect(execSpy).toHaveBeenCalledTimes(1);
    const execCall = execSpy.mock.calls[0];
    expect(execCall).toBeDefined();
    if (!execCall) {
      return;
    }
    const [, command, opts] = execCall;
    expect(command).toContain("set -euo pipefail");
    expect(command).toContain(
      "/opt/bin/dsbx function build -- '/files/pod-spc123/greet.ts'"
    );
    expect(opts?.user).toBe("agent-proxied");

    // Reads the bundle first, then the schema, both from the scratch dir the command created.
    expect(readSpy).toHaveBeenCalledTimes(2);
    const bundleReadPath = readSpy.mock.calls[0]?.[1];
    const schemaReadPath = readSpy.mock.calls[1]?.[1];
    expect(bundleReadPath).toMatch(
      /^\/tmp\/dust-sandbox-function-builds\/.+\/bundle\.js$/
    );
    expect(schemaReadPath).toMatch(
      /^\/tmp\/dust-sandbox-function-builds\/.+\/schema\.json$/
    );
    expect(command).toContain(bundleReadPath);
    expect(command).toContain(schemaReadPath);
  });

  it("parses manifest.v1 databases from the schema file", async () => {
    const { authenticator, sandbox, space } = await setup();
    const schemaWithManifests = JSON.stringify({
      ...JSON.parse(validSchemaFile),
      databases: {
        version: 1,
        databases: {
          chat: {
            schemaFile: "databases/chat.db.ts",
            tables: {
              users: {
                columns: {
                  id: {
                    type: "integer",
                    mode: null,
                    notNull: true,
                    hasDefault: true,
                    primaryKey: true,
                    autoIncrement: true,
                  },
                  created_at: {
                    type: "integer",
                    mode: "timestamp",
                    notNull: true,
                    hasDefault: false,
                    primaryKey: false,
                    autoIncrement: false,
                  },
                },
                indexes: {
                  users_handle_idx: { unique: true, columns: ["handle"] },
                },
              },
            },
          },
        },
      },
    });
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: okEnvelope, stderr: "" })
    );
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from("bundle")))
      .mockResolvedValueOnce(new Ok(Buffer.from(schemaWithManifests)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.manifests?.version).toBe(1);
    expect(
      result.value.manifests?.databases.chat?.tables.users?.columns.created_at
        ?.mode
    ).toBe("timestamp");
  });

  it("rejects manifests carrying reserved object keys (prototype pollution)", async () => {
    const { authenticator, sandbox, space } = await setup();
    // Built as a raw JSON string: an object literal with a "__proto__" key would set the
    // prototype instead of creating the own key this test needs.
    const hostileManifests =
      `{"version":1,"databases":{"chat":{"schemaFile":"databases/chat.db.ts",` +
      `"tables":{"__proto__":{"columns":{},"indexes":{}}}}}}`;
    const schemaWithHostileManifests = `{${validSchemaFile.slice(1, -1)},"databases":${hostileManifests}}`;
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: okEnvelope, stderr: "" })
    );
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from("bundle")))
      .mockResolvedValueOnce(new Ok(Buffer.from(schemaWithHostileManifests)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("schema_extraction_failed");
  });

  it("rejects a schema file with a malformed manifests shape", async () => {
    const { authenticator, sandbox, space } = await setup();
    const badManifests = JSON.stringify({
      ...JSON.parse(validSchemaFile),
      databases: { version: 2, databases: {} },
    });
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: okEnvelope, stderr: "" })
    );
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from("bundle")))
      .mockResolvedValueOnce(new Ok(Buffer.from(badManifests)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("schema_extraction_failed");
  });

  it("surfaces a build failure from the envelope without reading files", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 1,
        stdout: JSON.stringify({
          ok: false,
          error: { kind: "build_failed", message: "Unexpected token" },
        }),
        stderr: "",
      })
    );
    const readSpy = vi.spyOn(sandbox, "readFile");

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("build_failed");
    expect(result.error.message).toContain("Unexpected token");
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("maps manifest build-error kinds to the model-correctable invalid_contract", async () => {
    const { authenticator, sandbox, space } = await setup();
    for (const kind of [
      "databases_declaration_invalid",
      "database_schema_unresolvable",
      "database_schema_invalid",
    ]) {
      vi.spyOn(sandbox, "exec").mockResolvedValue(
        new Ok({
          exitCode: 1,
          stdout: JSON.stringify({
            ok: false,
            error: { kind, message: `refused: ${kind}` },
          }),
          stderr: "",
        })
      );

      const result = await buildSandboxFunctionOnSandbox(authenticator, {
        space,
        srcSandboxPath: SRC,
      });

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        return;
      }
      expect(result.error.code).toBe("invalid_contract");
      expect(result.error.message).toContain(kind);
    }
  });

  it("maps an unknown error kind to internal", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 2,
        stdout: JSON.stringify({
          ok: false,
          error: { kind: "bad_args", message: "missing operand" },
        }),
        stderr: "",
      })
    );

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
  });

  it("rejects a function missing an input or output schema", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: okEnvelope, stderr: "" })
    );
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from("bundle")))
      .mockResolvedValueOnce(
        new Ok(
          Buffer.from(
            JSON.stringify({
              name: "greet",
              description: null,
              input_schema: null,
              output_schema: { type: "object" },
            })
          )
        )
      );

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("invalid_contract");
  });

  it("returns an internal error when the exec itself fails", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Err(new Error("provider unavailable"))
    );

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).toContain("provider unavailable");
  });

  it("returns an internal error when dsbx produces no output", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
  });

  it("maps a sandbox failure to sandbox_unavailable", async () => {
    const { authenticator, space } = await setup();
    vi.mocked(ensurePodSandboxReady).mockResolvedValue(
      new Err(new Error("sandbox down"))
    );

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("sandbox_unavailable");
  });
});
