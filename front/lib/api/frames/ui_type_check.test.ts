// @vitest-environment node

import path from "node:path";

import {
  ensureFrameRuntimeTypesInstalled,
  FRAME_RUNTIME_TYPES_ROOT,
  parseTscOutput,
  typeCheckFrameUiOnSandbox,
} from "@app/lib/api/frames/ui_type_check";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const artifact = {
  id: "a".repeat(64),
  tarball: Buffer.from("not-really-a-tarball"),
  tarballSha256: "b".repeat(64),
};

const stagingDirectory = "/var/lib/dust/frame-sources/staged";

async function setup() {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(auth);
  const sandbox = await SandboxResource.makeNew(auth, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  const writeFile = vi
    .spyOn(sandbox, "writeFile")
    .mockResolvedValue(new Ok(undefined));
  const execRoot = vi
    .spyOn(sandbox, "execRoot")
    .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" }));
  const exec = vi
    .spyOn(sandbox, "exec")
    .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" }));

  return { auth, sandbox, writeFile, execRoot, exec };
}

function renderedRootCommands(
  execRoot: Awaited<ReturnType<typeof setup>>["execRoot"]
) {
  return execRoot.mock.calls.map((call) => renderRootCommand(call[1]));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseTscOutput", () => {
  it("parses located and global diagnostics with continuation lines", () => {
    expect(
      parseTscOutput(
        [
          "/src/index.tsx(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
          "/check/entry-check.tsx(2,28): error TS2786: 'FrameComponent' cannot be used as a JSX component.",
          "  Its type 'number' is not a valid JSX element type.",
          "error TS5083: Cannot read file 'tsconfig.json'.",
          "",
        ].join("\n")
      )
    ).toEqual([
      {
        file: "/src/index.tsx",
        line: 3,
        column: 5,
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
      },
      {
        file: "/check/entry-check.tsx",
        line: 2,
        column: 28,
        code: "TS2786",
        message:
          "'FrameComponent' cannot be used as a JSX component.\nIts type 'number' is not a valid JSX element type.",
      },
      {
        file: null,
        line: null,
        column: null,
        code: "TS5083",
        message: "Cannot read file 'tsconfig.json'.",
      },
    ]);
  });
});

describe("ensureFrameRuntimeTypesInstalled", () => {
  it("skips the upload when the artifact is already installed", async () => {
    const { auth, sandbox, writeFile, execRoot } = await setup();

    const result = await ensureFrameRuntimeTypesInstalled(auth, {
      sandbox,
      artifact,
    });

    expect(result.isOk() && result.value).toBe(
      `${FRAME_RUNTIME_TYPES_ROOT}/${artifact.id}`
    );
    expect(renderedRootCommands(execRoot)).toEqual([
      `/usr/bin/test -f ${FRAME_RUNTIME_TYPES_ROOT}/${artifact.id}/tsconfig.json`,
    ]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("uploads, verifies and atomically installs a missing artifact", async () => {
    const { auth, sandbox, writeFile, execRoot } = await setup();
    execRoot.mockResolvedValueOnce(
      new Ok({ exitCode: 1, stdout: "", stderr: "" })
    );

    const result = await ensureFrameRuntimeTypesInstalled(auth, {
      sandbox,
      artifact,
    });

    expect(result.isOk()).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [, tarballPath] = writeFile.mock.calls[0];
    expect(tarballPath).toMatch(
      new RegExp(
        `^${FRAME_RUNTIME_TYPES_ROOT}/\\.${artifact.id}\\.[^/]+\\.tgz$`
      )
    );
    const commands = renderedRootCommands(execRoot);
    expect(commands).toHaveLength(4);
    expect(commands[1]).toContain(
      `/usr/bin/install -d -m 0755 -o root -g root ${FRAME_RUNTIME_TYPES_ROOT}`
    );
    expect(commands[2]).toContain(`${artifact.tarballSha256}`);
    expect(commands[2]).toContain("/usr/bin/sha256sum -c --status");
    expect(commands[2]).toContain("/usr/bin/tar -xzf");
    expect(commands[2]).toContain(
      `/usr/bin/mv -T -- '${FRAME_RUNTIME_TYPES_ROOT}/.${artifact.id}.`
    );
    expect(commands[3]).toMatch(/^\/usr\/bin\/rm -rf -- /);
  });

  it("reports a failed installation", async () => {
    const { auth, sandbox, execRoot } = await setup();
    execRoot
      .mockResolvedValueOnce(new Ok({ exitCode: 1, stdout: "", stderr: "" }))
      .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
      .mockResolvedValueOnce(
        new Ok({ exitCode: 1, stdout: "", stderr: "sha256sum: WARNING" })
      );

    const result = await ensureFrameRuntimeTypesInstalled(auth, {
      sandbox,
      artifact,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "internal",
      message:
        "Frame runtime types installation failed with exit code 1: sha256sum: WARNING",
    });
    expect(renderedRootCommands(execRoot).at(-1)).toMatch(
      /^\/usr\/bin\/rm -rf -- /
    );
  });
});

describe("typeCheckFrameUiOnSandbox", () => {
  const params = {
    runtimeDirectory: `${FRAME_RUNTIME_TYPES_ROOT}/${artifact.id}`,
    stagingDirectory,
    entryRelPath: "index.tsx",
  };

  it("runs tsc as the workload user over a scratch entry check", async () => {
    const { auth, sandbox, writeFile, execRoot, exec } = await setup();

    const result = await typeCheckFrameUiOnSandbox(auth, {
      sandbox,
      ...params,
    });

    expect(result.isOk() && result.value).toEqual({ warnings: [] });
    expect(writeFile).toHaveBeenCalledTimes(2);
    const [
      [, entryCheckPath, entryCheckBytes],
      [, tsconfigPath, tsconfigBytes],
    ] = writeFile.mock.calls;
    expect(entryCheckPath).toMatch(
      /^\/tmp\/dust-frame-ui-checks\/[^/]+\/entry-check\.tsx$/
    );
    expect(Buffer.from(entryCheckBytes).toString("utf8")).toBe(
      `import FrameComponent from "${stagingDirectory}/index";\n` +
        "export const entryCheck = <FrameComponent />;\n"
    );
    expect(JSON.parse(Buffer.from(tsconfigBytes).toString("utf8"))).toEqual({
      extends: `${params.runtimeDirectory}/tsconfig.json`,
      compilerOptions: { noEmit: true },
      files: [entryCheckPath],
    });
    expect(tsconfigPath).toBe(
      entryCheckPath.replace("entry-check.tsx", "tsconfig.json")
    );
    expect(exec).toHaveBeenCalledWith(
      auth,
      expect.stringMatching(
        /^cd '\/tmp\/dust-frame-ui-checks\/[^/]+' && \/opt\/npm-global\/bin\/tsc -p tsconfig\.json --pretty false$/
      ),
      { timeoutMs: 120_000, user: "agent-proxied" }
    );
    expect(renderedRootCommands(execRoot).at(-1)).toMatch(
      /^\/usr\/bin\/rm -rf -- \/tmp\/dust-frame-ui-checks\/[^/]+$/
    );
  });

  it("fails publication on unresolved imports and keeps other diagnostics as warnings", async () => {
    const { auth, sandbox, exec } = await setup();
    exec.mockResolvedValue(
      new Ok({
        exitCode: 2,
        stdout: [
          `${stagingDirectory}/index.tsx(1,10): error TS2305: Module '"shadcn"' has no exported member 'Nope'.`,
          `${stagingDirectory}/index.tsx(4,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
        ].join("\n"),
        stderr: "",
      })
    );

    const result = await typeCheckFrameUiOnSandbox(auth, {
      sandbox,
      ...params,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "ui_build_failed",
      message:
        "Frame UI imports do not resolve against the Frame runtime:\n" +
        `index.tsx:1:10: error TS2305: Module '"shadcn"' has no exported member 'Nope'.`,
    });
  });

  it("fails publication when the entry point is not a prop-less component", async () => {
    const { auth, sandbox, exec } = await setup();
    exec.mockResolvedValue(
      new Ok({
        exitCode: 2,
        stdout:
          "entry-check.tsx(2,28): error TS2741: Property 'title' is missing in type '{}' but required in type '{ title: string; }'.",
        stderr: "",
      })
    );

    const result = await typeCheckFrameUiOnSandbox(auth, {
      sandbox,
      ...params,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "ui_build_failed",
      message:
        "Frame UI entry point must default-export a component that renders without props:\n" +
        "error TS2741: Property 'title' is missing in type '{}' but required in type '{ title: string; }'.",
    });
  });

  it("returns type errors as warnings", async () => {
    const { auth, sandbox, exec, writeFile } = await setup();
    exec.mockImplementation(async () => {
      const [, entryCheckPath] = writeFile.mock.calls[0];
      const diagnosticPath = path.posix.relative(
        path.posix.dirname(entryCheckPath),
        `${stagingDirectory}/lib/util.ts`
      );
      return new Ok({
        exitCode: 2,
        stdout: `${diagnosticPath}(4,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
        stderr: "",
      });
    });

    const result = await typeCheckFrameUiOnSandbox(auth, {
      sandbox,
      ...params,
    });

    expect(result.isOk() && result.value).toEqual({
      warnings: [
        {
          type: "typescript",
          message:
            "lib/util.ts:4:7: error TS2322: Type 'string' is not assignable to type 'number'.",
        },
      ],
    });
  });

  it("reports a compiler failure as internal", async () => {
    const { auth, sandbox, exec } = await setup();
    exec.mockResolvedValue(
      new Ok({ exitCode: 127, stdout: "", stderr: "tsc: not found" })
    );

    const result = await typeCheckFrameUiOnSandbox(auth, {
      sandbox,
      ...params,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "internal",
      message: "Frame UI type check failed with exit code 127: tsc: not found",
    });
  });

  it("propagates sandbox failures", async () => {
    const { auth, sandbox, exec } = await setup();
    exec.mockResolvedValue(new Err(new Error("sandbox gone")));

    const result = await typeCheckFrameUiOnSandbox(auth, {
      sandbox,
      ...params,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "internal",
      message: "sandbox gone",
    });
  });
});
