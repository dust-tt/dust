// @vitest-environment node

import { reconcileFramePublicationDatabases } from "@app/lib/api/frames/database_reconciliation";
import { FRAME_SOURCE_STAGING_ROOT } from "@app/lib/api/frames/source_staging";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { reconcileDatabaseOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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
  vi.spyOn(sandbox, "exec").mockResolvedValue(
    new Ok({ exitCode: 0, stdout: "", stderr: "" })
  );
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
    expect(sandbox.exec).toHaveBeenCalledWith(
      auth,
      expect.stringMatching(
        new RegExp(`^rm -rf -- '${FRAME_SOURCE_STAGING_ROOT}/[^/]+'$`)
      ),
      { user: "agent-proxied" }
    );
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
      sourceFiles,
    });

    expect(result.isErr() && result.error.code).toBe("reconcile_blocked");
    expect(sandbox.exec).toHaveBeenCalledOnce();
  });
});
