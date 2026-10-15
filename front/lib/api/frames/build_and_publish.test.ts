// @vitest-environment node

import {
  buildAndPublishFramePublication,
  buildFramePublication,
  validateFramePublication,
} from "@app/lib/api/frames/build_and_publish";
import {
  computeFrameSourcePathSetSha256,
  FRAME_SOURCE_STAGING_ROOT,
} from "@app/lib/api/frames/source_staging";
import {
  ensureConversationSandboxReadyWithScope,
  ensureFrameSandboxReady,
} from "@app/lib/api/sandbox/lifecycle";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import {
  getFramePublicationFunctionsArchivePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/lifecycle")>();
  return {
    ...actual,
    ensureFrameSandboxReady: vi.fn(),
    ensureConversationSandboxReadyWithScope: vi.fn(),
  };
});

vi.mock(
  "@app/lib/api/sandbox_functions/build_on_sandbox",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/build_on_sandbox")
      >();
    return { ...actual, buildSandboxFunctionOnReadySandbox: vi.fn() };
  }
);

vi.mock("@app/lib/api/sandbox_functions/dsbx_db", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/dsbx_db")
    >();
  return { ...actual, reconcileDatabaseOnReadySandbox: vi.fn() };
});

vi.mock("@app/lib/api/frames/seed_functions_archive", () => ({
  seedFramePublicationFunctionsArchive: vi.fn().mockResolvedValue(undefined),
}));

const manifest = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
    },
    {
      name: "list-tasks",
      description: "List tasks.",
      entryPoint: "functions/list_tasks.ts",
    },
  ],
});

const uiOnlyManifest = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
  description: "Track tasks.",
});

const databaseManifest = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
  description: "Track tasks.",
  databases: [{ name: "tasks", schema: "databases/tasks.db.ts" }],
});

const functionsAndDatabaseManifest = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
    },
  ],
  databases: [{ name: "tasks", schema: "databases/tasks.db.ts" }],
});

const sourceFiles = [
  {
    relativePath: "index.tsx",
    content: Buffer.from(
      "export default function App() { return <main>Tasks</main>; }"
    ),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "functions/add_task.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "functions/list_tasks.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
];

const sourceFilesWithDatabase = [
  ...sourceFiles,
  {
    relativePath: "databases/tasks.db.ts",
    content: Buffer.from("export const tasks = {};"),
    contentType: "text/typescript" as const,
  },
];

async function setup(): Promise<{
  auth: Authenticator;
  conversation: Awaited<ReturnType<typeof ConversationFactory.create>>;
  frame: FileResource;
  sandbox: SandboxResource;
}> {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(auth);
  // Conversation exists so FileFactory conversation use-cases remain available if needed.
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: "created",
    useCase: "project_context",
  });
  const sandbox = await SandboxResource.makeNew(auth, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.spyOn(sandbox, "writeFile").mockResolvedValue(new Ok(undefined));
  vi.spyOn(sandbox, "execRoot").mockImplementation(async () => {
    const call = vi.mocked(sandbox.execRoot).mock.calls.length;
    const pathSetSha256 = computeFrameSourcePathSetSha256(
      sourceFiles.map((sourceFile) => sourceFile.relativePath)
    );
    return new Ok({
      exitCode: 0,
      stdout: call === 2 ? `${pathSetSha256}  -\n` : "",
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
    new Ok({ sandbox, freshlyCreated: false, scope: { spaceId: null } })
  );
  vi.mocked(ensureConversationSandboxReadyWithScope).mockResolvedValue(
    new Ok({
      sandbox,
      freshlyCreated: false,
      scope: { spaceId: null },
    })
  );
  vi.mocked(reconcileDatabaseOnReadySandbox).mockResolvedValue(
    new Ok({ database: "tasks", created: false, statements: [] })
  );

  return { auth, conversation, frame, sandbox };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("buildAndPublishFramePublication", () => {
  it("leaves package-path authoring checks to the Frame linter", async () => {
    const { auth, frame } = await setup();
    const result = await validateFramePublication(auth, {
      frame,
      manifest: uiOnlyManifest,
      sourceFiles: [
        {
          ...sourceFiles[0],
          content: Buffer.from(
            'export default () => <main>{"conversation-test/MyFrame/data.csv"}</main>'
          ),
        },
        {
          relativePath: "data.csv",
          content: Buffer.from("value\n42\n"),
          contentType: "text/csv",
        },
      ],
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects forbidden Tailwind values without writing a publication", async () => {
    const { auth, frame } = await setup();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      description: "Track tasks.",
    });

    const result = await validateFramePublication(auth, {
      frame,
      manifest: uiOnlyManifest,
      sourceFiles: [
        {
          ...sourceFiles[0],
          content: Buffer.from(
            'export default function App() { return <main className="h-[600px]">Tasks</main>; }'
          ),
        },
      ],
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_tailwind",
      message: expect.stringContaining(
        "index.tsx: Forbidden Tailwind arbitrary value 'h-[600px]'"
      ),
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    expect(
      (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata
        ?.activePublicationId
    ).toBe(activePublicationId);
  });

  it("validates database schema contracts without publishing", async () => {
    const { auth, frame } = await setup();

    const result = await validateFramePublication(auth, {
      frame,
      manifest: databaseManifest,
      sourceFiles: sourceFiles.slice(0, 1),
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
      message: "Frame database schema not found: tasks (databases/tasks.db.ts)",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("leaves function-name authoring checks to the Frame linter", async () => {
    const { auth, frame } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest: uiOnlyManifest,
      sourceFiles: [
        {
          ...sourceFiles[0],
          content: Buffer.from(
            'import { useFrameFunction } from "@dust/react-hooks";\n' +
              "export default function App() {\n" +
              '  useFrameFunction("list-tasks", {});\n' +
              "  return <main>Tasks</main>;\n" +
              "}\n"
          ),
        },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
    expect(
      (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata
        ?.activePublicationId
    ).toBe(result.isOk() ? result.value.publicationId : undefined);
  });

  it("builds and publishes the UI without starting a sandbox", async () => {
    const { auth, frame } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest: uiOnlyManifest,
      sourceFiles: sourceFiles.slice(0, 1),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
    const uiBundlePath = getFramePublicationUiBundlePath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      frameId: frame.sId,
      publicationId: result.value.publicationId,
    });
    expect(fileStorageMock.getObject(uiBundlePath)).toContain(
      'data-source="index.tsx:'
    );
  });

  it("refuses to publish a UI with forbidden Tailwind values", async () => {
    const { auth, frame } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest: uiOnlyManifest,
      sourceFiles: [
        {
          ...sourceFiles[0],
          content: Buffer.from(
            'export default function App() { return <main className="h-[600px]">Tasks</main>; }'
          ),
        },
      ],
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_tailwind",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    expect(
      (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata
        ?.activePublicationId
    ).toBeUndefined();
  });

  it("builds every declared function before publishing", async () => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(buildSandboxFunctionOnReadySandbox)
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export const addTask = true;",
          userIdentity: "workspace_user_required",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        })
      )
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export const listTasks = true;",
          userIdentity: "optional",
          inputSchema: { type: "object" },
          outputSchema: { type: "array" },
        })
      );

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest,
      sourceFiles,
    });

    expect(result.isOk()).toBe(true);
    expect(sandbox.writeFile).toHaveBeenCalledTimes(1);
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      auth,
      expect.stringMatching(
        new RegExp(`^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/sources\\.tar$`)
      ),
      expect.any(ArrayBuffer)
    );
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalledWith(auth, {
      sandbox,
      srcSandboxPath: expect.stringMatching(
        new RegExp(
          `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/functions/add_task\\.ts$`
        )
      ),
    });
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalledWith(auth, {
      sandbox,
      srcSandboxPath: expect.stringMatching(
        new RegExp(
          `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/functions/list_tasks\\.ts$`
        )
      ),
    });
    expect(sandbox.readFile).not.toHaveBeenCalled();
    expect(
      renderRootCommand(vi.mocked(sandbox.execRoot).mock.calls.at(-1)![1])
    ).toMatch(
      new RegExp(`^/usr/bin/rm -rf -- ${FRAME_SOURCE_STAGING_ROOT}/[^/]+$`)
    );
    expect(ensureFrameSandboxReady).toHaveBeenCalledOnce();
    expect(ensureFrameSandboxReady).toHaveBeenCalledWith(auth, frame);
    const publicationId = result.isOk() ? result.value.publicationId : "";
    const savedPaths = fileStorageMock.saveFileCalls.map(
      ({ filePath }) => filePath
    );
    expect(savedPaths).toContain(
      getFramePublicationFunctionsArchivePath({
        workspaceId: auth.getNonNullableWorkspace().sId,
        frameId: frame.sId,
        publicationId,
      })
    );
    expect(
      savedPaths.some((filePath) => /\/functions\/[^/]+\.ts$/.test(filePath))
    ).toBe(false);
    expect(savedPaths.some((filePath) => filePath.includes("/source/"))).toBe(
      false
    );

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      result.isOk() ? result.value.publicationId : undefined
    );
  });

  it("builds functions on the conversation sandbox when requested", async () => {
    const { auth, conversation, frame, sandbox } = await setup();
    vi.mocked(buildSandboxFunctionOnReadySandbox)
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export const addTask = true;",
          userIdentity: "workspace_user_required",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        })
      )
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export const listTasks = true;",
          userIdentity: "optional",
          inputSchema: { type: "object" },
          outputSchema: { type: "array" },
        })
      );

    const result = await buildFramePublication(auth, {
      frame,
      manifest,
      sourceFiles,
      reconcileDatabases: false,
      functionSandbox: { kind: "conversation", conversation },
    });

    expect(result.isOk()).toBe(true);
    expect(ensureConversationSandboxReadyWithScope).toHaveBeenCalledOnce();
    expect(ensureConversationSandboxReadyWithScope).toHaveBeenCalledWith(
      auth,
      conversation
    );
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
    expect(reconcileDatabaseOnReadySandbox).not.toHaveBeenCalled();
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalledWith(auth, {
      sandbox,
      srcSandboxPath: expect.stringMatching(
        new RegExp(
          `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/functions/add_task\\.ts$`
        )
      ),
    });
  });

  it("rejects conversation-sandbox builds that also request database reconcile", async () => {
    const { auth, conversation, frame } = await setup();

    const result = await buildFramePublication(auth, {
      frame,
      manifest: databaseManifest,
      sourceFiles: sourceFilesWithDatabase,
      reconcileDatabases: true,
      functionSandbox: { kind: "conversation", conversation },
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
      message: expect.stringContaining(
        "Database reconcile requires the Frame sandbox"
      ),
    });
    expect(ensureConversationSandboxReadyWithScope).not.toHaveBeenCalled();
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("stages sources once for function builds and database reconcile", async () => {
    const { auth, frame, sandbox } = await setup();
    const pathSetSha256 = computeFrameSourcePathSetSha256(
      sourceFilesWithDatabase.map((sourceFile) => sourceFile.relativePath)
    );
    vi.spyOn(sandbox, "execRoot").mockImplementation(async () => {
      const call = vi.mocked(sandbox.execRoot).mock.calls.length;
      return new Ok({
        exitCode: 0,
        stdout: call === 2 ? `${pathSetSha256}  -\n` : "",
        stderr: "",
      });
    });
    vi.spyOn(sandbox, "readFile").mockImplementation(
      async (_auth, filePath) => {
        const sourceFile = sourceFilesWithDatabase.find(({ relativePath }) =>
          filePath.endsWith(`/${relativePath}`)
        );
        return sourceFile
          ? new Ok(sourceFile.content)
          : new Err(new Error(`Unexpected staged path: ${filePath}`));
      }
    );
    vi.mocked(buildSandboxFunctionOnReadySandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export const addTask = true;",
        userIdentity: "optional",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      })
    );

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest: functionsAndDatabaseManifest,
      sourceFiles: sourceFilesWithDatabase,
    });

    expect(result.isOk()).toBe(true);
    expect(ensureFrameSandboxReady).toHaveBeenCalledOnce();
    expect(sandbox.writeFile).toHaveBeenCalledTimes(1);
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      auth,
      expect.stringMatching(
        new RegExp(`^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/sources\\.tar$`)
      ),
      expect.any(ArrayBuffer)
    );
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalledOnce();
    expect(reconcileDatabaseOnReadySandbox).toHaveBeenCalledOnce();
    expect(reconcileDatabaseOnReadySandbox).toHaveBeenCalledWith(auth, {
      sandbox,
      database: "tasks",
      schemaFileSandboxPath: expect.stringMatching(
        new RegExp(
          `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/databases/tasks\\.db\\.ts$`
        )
      ),
    });
  });

  it("keeps the previous publication active when database reconciliation fails", async () => {
    const { auth, frame, sandbox } = await setup();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      description: "Track tasks.",
    });
    const dbOnlySources = [
      sourceFiles[0],
      {
        relativePath: "databases/tasks.db.ts",
        content: Buffer.from("export const tasks = {};"),
        contentType: "text/typescript" as const,
      },
    ];
    const pathSetSha256 = computeFrameSourcePathSetSha256(
      dbOnlySources.map((sourceFile) => sourceFile.relativePath)
    );
    vi.spyOn(sandbox, "execRoot").mockImplementation(async () => {
      const call = vi.mocked(sandbox.execRoot).mock.calls.length;
      return new Ok({
        exitCode: 0,
        stdout: call === 2 ? `${pathSetSha256}  -\n` : "",
        stderr: "",
      });
    });
    vi.spyOn(sandbox, "readFile").mockImplementation(
      async (_auth, filePath) => {
        const sourceFile = dbOnlySources.find(({ relativePath }) =>
          filePath.endsWith(`/${relativePath}`)
        );
        return sourceFile
          ? new Ok(sourceFile.content)
          : new Err(new Error(`Unexpected staged path: ${filePath}`));
      }
    );
    vi.mocked(reconcileDatabaseOnReadySandbox).mockResolvedValueOnce(
      new Err(
        new SandboxFunctionError(
          "reconcile_blocked",
          'Database "tasks": destructive change.'
        )
      )
    );

    const published = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest: databaseManifest,
      sourceFiles: dbOnlySources,
    });

    expect(published.isErr() && published.error.code).toBe("reconcile_blocked");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      activePublicationId
    );
  });

  it("publishes only after staged function source cleanup succeeds", async () => {
    const { auth, frame, sandbox } = await setup();
    vi.mocked(buildSandboxFunctionOnReadySandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export const built = true;",
        userIdentity: "optional",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      })
    );

    const pathSetSha256 = computeFrameSourcePathSetSha256(
      sourceFiles.map((sourceFile) => sourceFile.relativePath)
    );
    const execRoot = vi.mocked(sandbox.execRoot);
    execRoot.mockImplementation(async () => {
      const call = execRoot.mock.calls.length;
      if (call === 3) {
        return new Err(new Error("cleanup failed"));
      }
      return new Ok({
        exitCode: 0,
        stdout: call === 2 ? `${pathSetSha256}  -\n` : "",
        stderr: "",
      });
    });

    const failed = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest,
      sourceFiles,
    });

    expect(failed.isErr() && failed.error).toMatchObject({
      code: "internal",
      message: "cleanup failed",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    expect(
      (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata
        ?.activePublicationId
    ).toBeUndefined();

    execRoot.mockClear();
    execRoot.mockImplementation(async () => {
      const call = execRoot.mock.calls.length;
      return new Ok({
        exitCode: 0,
        stdout: call === 2 ? `${pathSetSha256}  -\n` : "",
        stderr: "",
      });
    });

    const published = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest,
      sourceFiles,
    });

    expect(published.isOk()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(3);
    expect(
      fileStorageMock.saveFileCalls.filter(({ filePath }) =>
        filePath.endsWith("/publication.json")
      )
    ).toHaveLength(1);
    expect(
      (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata
        ?.activePublicationId
    ).toBe(published.isOk() ? published.value.publicationId : undefined);
  });

  it("does not write a publication when a function build fails", async () => {
    const { auth, frame } = await setup();
    vi.mocked(buildSandboxFunctionOnReadySandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("build_failed", "Invalid export."))
    );

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest,
      sourceFiles,
    });

    expect(result.isErr() && result.error).toEqual(
      new SandboxFunctionError(
        "build_failed",
        'Failed to build Frame function "add-task": Invalid export.'
      )
    );
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalled();
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBeUndefined();
  });

  it.each([
    { operation: "validation", build: validateFramePublication },
    { operation: "publishing", build: buildAndPublishFramePublication },
  ])(
    "keeps the active publication when UI $operation fails",
    async ({ build }) => {
      const { auth, frame } = await setup();
      const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
      await frame.setActiveFramePublication({
        publicationId: activePublicationId,
        description: "Track tasks.",
      });

      const result = await build(auth, {
        mode: "live",
        frame,
        manifest,
        sourceFiles: [
          {
            ...sourceFiles[0],
            content: Buffer.from("export default function App( {"),
          },
          ...sourceFiles.slice(1),
        ],
      });

      expect(result.isErr() && result.error.code).toBe("ui_build_failed");
      expect(result.isErr() && result.error.message).toMatch(
        /Failed to build Frame UI: index\.tsx:\nTypeScript syntax errors detected[\s\S]*Line 1, Column \d+: error TS/
      );
      // UI build runs in parallel with sandbox work; sandbox may start before UI fails.
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
        activePublicationId
      );
    }
  );

  it("rejects an unsafe snapshot path before staging or building", async () => {
    const { auth, frame, sandbox } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      mode: "live",
      frame,
      manifest,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "../outside.ts",
          content: Buffer.from("export const outside = true;"),
          contentType: "text/typescript",
        },
      ],
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
    expect(sandbox.writeFile).not.toHaveBeenCalled();
    expect(buildSandboxFunctionOnReadySandbox).not.toHaveBeenCalled();
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
