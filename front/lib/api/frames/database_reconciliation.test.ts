// @vitest-environment node

import { reconcileFramePublicationDatabases } from "@app/lib/api/frames/database_reconciliation";
import { getFrameSourceLockName } from "@app/lib/api/frames/operation_lock";
import {
  computeFrameSourcePathSetSha256,
  FRAME_SOURCE_STAGING_ROOT,
} from "@app/lib/api/frames/source_staging";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { reconcileDatabaseOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { LockLeaseLostError } from "@app/lib/lock";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { makeAlwaysHeldLockLease } from "@app/tests/utils/LockLeaseFactory";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/lifecycle")>();
  return { ...actual, ensureFrameSandboxReady: vi.fn() };
});

vi.mock("@app/lib/api/sandbox_functions/dsbx_db", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/dsbx_db")
    >();
  return { ...actual, reconcileDatabaseOnReadySandbox: vi.fn() };
});

const manifest = FrameManifestSchema.parse({
  version: 1,
  name: "Tasks",
  description: "Track tasks.",
  databases: [{ name: "tasks", schema: "databases/tasks.db.ts" }],
});

const sourceFiles = [
  {
    relativePath: "index.tsx",
    content: Buffer.from("export default function App() {}"),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "databases/tasks.db.ts",
    content: Buffer.from('import { columns } from "./columns";'),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "databases/columns.ts",
    content: Buffer.from("export const columns = {};"),
    contentType: "text/typescript" as const,
  },
];

function pathSetHashStdout(relativePaths: ReadonlyArray<string>): string {
  return `${computeFrameSourcePathSetSha256(relativePaths)}  -\n`;
}

async function setup() {
  const { authenticator } = await createResourceTest({ role: "admin" });
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: "created",
    useCase: "project_context",
  });
  const sandbox = await SandboxResource.makeNew(authenticator, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.spyOn(sandbox, "writeFile").mockResolvedValue(new Ok(undefined));
  vi.spyOn(sandbox, "execRoot").mockImplementation(async () => {
    const call = vi.mocked(sandbox.execRoot).mock.calls.length;
    return new Ok({
      exitCode: 0,
      stdout:
        call === 2
          ? pathSetHashStdout(
              sourceFiles.map((sourceFile) => sourceFile.relativePath)
            )
          : "",
      stderr: "",
    });
  });
  vi.spyOn(sandbox, "readFile").mockImplementation(async (_auth, filePath) => {
    const sourceFile = sourceFiles.find(({ relativePath }) =>
      filePath.endsWith(`/${relativePath}`)
    );
    return sourceFile
      ? new Ok(sourceFile.content)
      : new Err(new Error(`Unexpected staged path: ${filePath}`));
  });
  vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
    new Ok({
      sandbox,
      freshlyCreated: false,
      scope: { spaceId: null },
    })
  );
  vi.mocked(reconcileDatabaseOnReadySandbox).mockResolvedValue(
    new Ok({ database: "tasks", created: true, statements: [] })
  );

  return { auth: authenticator, frame, sandbox };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileFramePublicationDatabases", () => {
  it("does not start a Frame sandbox when no database is declared", async () => {
    const { auth, frame } = await setup();

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest: FrameManifestSchema.parse({
        version: 1,
        name: "Static",
        description: "Static Frame.",
      }),
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles: sourceFiles.slice(0, 1),
    });

    expect(result.isOk()).toBe(true);
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("stages the captured source tree and reconciles the Frame-owned database", async () => {
    const { auth, frame, sandbox } = await setup();

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles,
    });

    expect(result.isOk()).toBe(true);
    expect(sandbox.writeFile).toHaveBeenCalledTimes(sourceFiles.length);
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      auth,
      expect.stringMatching(
        new RegExp(
          `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/databases/columns\\.ts$`
        )
      ),
      expect.any(ArrayBuffer)
    );
    expect(reconcileDatabaseOnReadySandbox).toHaveBeenCalledWith(auth, {
      sandbox,
      database: "tasks",
      schemaFileSandboxPath: expect.stringMatching(
        new RegExp(
          `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/databases/tasks\\.db\\.ts$`
        )
      ),
    });
    expect(sandbox.readFile).toHaveBeenCalledTimes(sourceFiles.length);
    expect(
      renderRootCommand(vi.mocked(sandbox.execRoot).mock.calls.at(-1)![1])
    ).toMatch(
      new RegExp(`^/usr/bin/rm -rf -- ${FRAME_SOURCE_STAGING_ROOT}/[^/]+$`)
    );
  });

  it("stops before the second database when the source lease is lost", async () => {
    const { auth, frame } = await setup();
    const leaseError = new LockLeaseLostError(
      getFrameSourceLockName(frame.sId)
    );
    const sourceLease = {
      check: vi
        .fn()
        .mockReturnValueOnce(new Ok(undefined))
        .mockReturnValueOnce(new Err(leaseError)),
    };

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest: FrameManifestSchema.parse({
        version: 1,
        name: "Tasks",
        description: "Track tasks.",
        databases: [
          { name: "tasks", schema: "databases/tasks.db.ts" },
          { name: "archive", schema: "databases/tasks.db.ts" },
        ],
      }),
      sourceLease,
      sourceFiles,
    });

    expect(result.isErr() && result.error).toEqual(leaseError);
    expect(reconcileDatabaseOnReadySandbox).toHaveBeenCalledOnce();
    expect(sourceLease.check).toHaveBeenCalledTimes(2);
  });

  it("returns a reconciliation error and still removes the staged source", async () => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(reconcileDatabaseOnReadySandbox).mockResolvedValueOnce(
      new Err(
        new SandboxFunctionError(
          "reconcile_blocked",
          'Database "tasks": destructive change.'
        )
      )
    );

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "reconcile_blocked",
    });
    expect(sandbox.execRoot).toHaveBeenCalledTimes(3);
  });

  it("refuses to reconcile when staged source differs from the capture", async () => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(sandbox.readFile).mockResolvedValueOnce(
      new Ok(Buffer.from("modified"))
    );

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles,
    });

    expect(result.isErr() && result.error).toMatchObject({ code: "internal" });
    expect(reconcileDatabaseOnReadySandbox).not.toHaveBeenCalled();
    expect(sandbox.execRoot).toHaveBeenCalledTimes(3);
  });

  it("refuses to reconcile when staging contains an extra regular file", async () => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(sandbox.execRoot).mockResolvedValueOnce(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );
    vi.mocked(sandbox.execRoot).mockResolvedValueOnce(
      new Ok({
        exitCode: 0,
        stdout: pathSetHashStdout([
          ...sourceFiles.map((sourceFile) => sourceFile.relativePath),
          "databases/injected.ts",
        ]),
        stderr: "",
      })
    );

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "internal",
      message: "Staged Frame source file set differs from the captured source.",
    });
    expect(sandbox.readFile).not.toHaveBeenCalled();
    expect(reconcileDatabaseOnReadySandbox).not.toHaveBeenCalled();
    expect(sandbox.execRoot).toHaveBeenCalledTimes(3);
  });

  it("fails the operation when staged source cleanup fails", async () => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(sandbox.execRoot).mockResolvedValueOnce(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );
    vi.mocked(sandbox.execRoot).mockResolvedValueOnce(
      new Ok({
        exitCode: 0,
        stdout: pathSetHashStdout(
          sourceFiles.map((sourceFile) => sourceFile.relativePath)
        ),
        stderr: "",
      })
    );
    vi.mocked(sandbox.execRoot).mockResolvedValueOnce(
      new Err(new Error("cleanup failed"))
    );

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles,
    });

    expect(result.isErr() && result.error.message).toBe("cleanup failed");
  });

  it.each([
    { operation: "creation", failedCall: 1 },
    { operation: "hardening", failedCall: 2 },
    { operation: "cleanup", failedCall: 3 },
  ])("rejects a nonzero root $operation command", async ({ failedCall }) => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(sandbox.execRoot).mockImplementation(async () => {
      const call = vi.mocked(sandbox.execRoot).mock.calls.length;
      return new Ok({
        exitCode: call === failedCall ? 1 : 0,
        stdout:
          call === 2 && failedCall !== 2
            ? pathSetHashStdout(
                sourceFiles.map((sourceFile) => sourceFile.relativePath)
              )
            : "",
        stderr: call === failedCall ? "root command failed" : "",
      });
    });

    const result = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceLease: makeAlwaysHeldLockLease(),
      sourceFiles,
    });

    expect(result.isErr() && result.error.message).toContain(
      "root command failed"
    );
    if (failedCall === 3) {
      expect(reconcileDatabaseOnReadySandbox).toHaveBeenCalledOnce();
    } else {
      expect(reconcileDatabaseOnReadySandbox).not.toHaveBeenCalled();
    }
  });
});
