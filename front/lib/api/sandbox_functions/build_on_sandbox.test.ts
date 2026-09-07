import { createHash } from "node:crypto";

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

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Mocks the producing exec: extracts the bundle/schema staging paths from the command and
 * returns the build envelope followed by the integrity marker and per-file sha256 lines for
 * `contents`, mirroring what the real `sha256sum` capture prints.
 */
function mockExecWithHashes(
  sandbox: SandboxResource,
  contents: Record<"bundle.js" | "schema.json", string>
) {
  return vi
    .spyOn(sandbox, "exec")
    .mockImplementation(async (_auth, command) => {
      // Paths are shell-quoted in the command; strip the surrounding single quotes.
      const paths = [
        ...new Set(
          [
            ...command.matchAll(
              /'?(\/[\w./-]+\/(?:bundle\.js|schema\.json))'?/g
            ),
          ].map((m) => m[1])
        ),
      ];
      const hashLines = paths
        .map((p) => {
          const name = p.endsWith("bundle.js") ? "bundle.js" : "schema.json";
          return `${sha256Hex(contents[name])}  ${p}`;
        })
        .join("\n");
      return new Ok({
        exitCode: 0,
        stdout: `${okEnvelope}\n__DUST_STAGING_SHA256__\n${hashLines}\n`,
        stderr: "",
      });
    });
}

const BUNDLE_CONTENT = "export default {/*bundle*/};";

const validSchemaFile = JSON.stringify({
  name: "greet",
  description: "Greet someone.",
  userIdentity: "frame_author_required",
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
    const execSpy = mockExecWithHashes(sandbox, {
      "bundle.js": BUNDLE_CONTENT,
      "schema.json": validSchemaFile,
    });
    const readSpy = vi
      .spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from(BUNDLE_CONTENT)))
      .mockResolvedValueOnce(new Ok(Buffer.from(validSchemaFile)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.bundleCode).toBe(BUNDLE_CONTENT);
    expect(result.value.userIdentity).toBe("frame_author_required");
    expect(result.value.inputSchema).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect(result.value.outputSchema).toEqual({
      type: "object",
      properties: { greeting: { type: "string" } },
    });

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
    mockExecWithHashes(sandbox, {
      "bundle.js": "bundle",
      "schema.json": JSON.stringify({
        name: "greet",
        description: null,
        userIdentity: "optional",
        input_schema: null,
        output_schema: { type: "object" },
      }),
    });
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from("bundle")))
      .mockResolvedValueOnce(
        new Ok(
          Buffer.from(
            JSON.stringify({
              name: "greet",
              description: null,
              userIdentity: "optional",
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

  it("rejects an older sandbox image that omits user identity", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockExecWithHashes(sandbox, {
      "bundle.js": "bundle",
      "schema.json": JSON.stringify({
        name: "greet",
        description: null,
        input_schema: { type: "object" },
        output_schema: { type: "object" },
      }),
    });
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from("bundle")))
      .mockResolvedValueOnce(
        new Ok(
          Buffer.from(
            JSON.stringify({
              name: "greet",
              description: null,
              input_schema: { type: "object" },
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
    expect(result.error.code).toBe("schema_extraction_failed");
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

  it("refuses a bundle artifact swapped after the build", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockExecWithHashes(sandbox, {
      "bundle.js": BUNDLE_CONTENT,
      "schema.json": validSchemaFile,
    });
    const swapped = Buffer.from('{"name":"CTF","value":"root-only-content"}');
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(swapped))
      .mockResolvedValueOnce(new Ok(Buffer.from(validSchemaFile)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).toContain(
      "changed between production and read-back"
    );
    // The swapped content must not leak through the error path.
    expect(result.error.message).not.toContain("root-only-content");
  });

  it("refuses a schema artifact swapped after the build", async () => {
    const { authenticator, sandbox, space } = await setup();
    mockExecWithHashes(sandbox, {
      "bundle.js": BUNDLE_CONTENT,
      "schema.json": validSchemaFile,
    });
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from(BUNDLE_CONTENT)))
      .mockResolvedValueOnce(new Ok(Buffer.from("swapped-schema")));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).toContain(
      "changed between production and read-back"
    );
  });

  it("fails closed when the exec output carries no integrity hashes", async () => {
    const { authenticator, sandbox, space } = await setup();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: okEnvelope, stderr: "" })
    );
    vi.spyOn(sandbox, "readFile")
      .mockResolvedValueOnce(new Ok(Buffer.from(BUNDLE_CONTENT)))
      .mockResolvedValueOnce(new Ok(Buffer.from(validSchemaFile)));

    const result = await buildSandboxFunctionOnSandbox(authenticator, {
      space,
      srcSandboxPath: SRC,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).toContain("Missing integrity hash");
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
