// @vitest-environment node

import {
  buildAndPublishFramePublication,
  validateFramePublication,
} from "@app/lib/api/frames/build_and_publish";
import {
  computeFrameSourcePathSetSha256,
  FRAME_SOURCE_STAGING_ROOT,
} from "@app/lib/api/frames/source_staging";
import { ensureConversationSandboxReadyWithScope } from "@app/lib/api/sandbox/lifecycle";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import {
  getFramePublicationFunctionBundlePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameV2ContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/lifecycle")>();
  return { ...actual, ensureConversationSandboxReadyWithScope: vi.fn() };
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

async function setup(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
  frame: FileResource;
  sandbox: SandboxResource;
  space: SpaceResource;
}> {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const space = await SpaceFactory.project(workspace, user.id);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(auth);
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
  vi.mocked(ensureConversationSandboxReadyWithScope).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false, scope: { spaceId: null } })
  );

  return { auth, conversation, frame, sandbox, space };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("buildAndPublishFramePublication", () => {
  it("validates UI and Tailwind without writing a publication", async () => {
    const { auth, conversation, frame } = await setup();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      name: "Task List",
      description: "Track tasks.",
    });

    const result = await validateFramePublication(auth, {
      conversation,
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

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.warnings).toMatchObject([
      {
        type: "tailwind",
        message: expect.stringContaining("index.tsx: Forbidden Tailwind"),
      },
    ]);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    expect(
      (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata
        ?.activePublicationId
    ).toBe(activePublicationId);
  });

  it("validates database schema contracts without publishing", async () => {
    const { auth, conversation } = await setup();

    const result = await validateFramePublication(auth, {
      conversation,
      manifest: databaseManifest,
      sourceFiles: sourceFiles.slice(0, 1),
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
      message: "Frame database schema not found: tasks (databases/tasks.db.ts)",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("builds and publishes the UI without starting a sandbox", async () => {
    const { auth, conversation, frame } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
      frame,
      manifest: uiOnlyManifest,
      sourceFiles: sourceFiles.slice(0, 1),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(ensureConversationSandboxReadyWithScope).not.toHaveBeenCalled();
    const uiBundlePath = getFramePublicationUiBundlePath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      frameId: frame.sId,
      publicationId: result.value.publicationId,
    });
    expect(fileStorageMock.getObject(uiBundlePath)).toContain(
      'data-source="index.tsx:'
    );
  });

  it("builds every declared function before publishing", async () => {
    const { auth, conversation, frame, sandbox, space } = await setup();
    vi.mocked(ensureConversationSandboxReadyWithScope).mockResolvedValue(
      new Ok({
        sandbox,
        freshlyCreated: false,
        scope: { spaceId: space.sId },
      })
    );
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
      conversation,
      frame,
      manifest,
      sourceFiles,
    });

    expect(result.isOk()).toBe(true);
    expect(sandbox.writeFile).toHaveBeenCalledTimes(sourceFiles.length);
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenNthCalledWith(
      1,
      auth,
      {
        sandbox,
        srcSandboxPath: expect.stringMatching(
          new RegExp(
            `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/functions/add_task\\.ts$`
          )
        ),
      }
    );
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenNthCalledWith(
      2,
      auth,
      {
        sandbox,
        srcSandboxPath: expect.stringMatching(
          new RegExp(
            `^${FRAME_SOURCE_STAGING_ROOT}/[^/]+/functions/list_tasks\\.ts$`
          )
        ),
      }
    );
    expect(sandbox.readFile).toHaveBeenCalledTimes(sourceFiles.length);
    expect(
      renderRootCommand(vi.mocked(sandbox.execRoot).mock.calls.at(-1)![1])
    ).toMatch(
      new RegExp(`^/usr/bin/rm -rf -- ${FRAME_SOURCE_STAGING_ROOT}/[^/]+$`)
    );
    expect(ensureConversationSandboxReadyWithScope).toHaveBeenCalledOnce();
    const publicationId = result.isOk() ? result.value.publicationId : "";
    const savedPaths = fileStorageMock.saveFileCalls.map(
      ({ filePath }) => filePath
    );
    for (const functionName of ["add-task", "list-tasks"]) {
      expect(savedPaths).toContain(
        getFramePublicationFunctionBundlePath({
          workspaceId: auth.getNonNullableWorkspace().sId,
          frameId: frame.sId,
          publicationId,
          functionName,
        })
      );
    }
    expect(savedPaths.some((filePath) => filePath.includes("/source/"))).toBe(
      false
    );

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      result.isOk() ? result.value.publicationId : undefined
    );
  });

  it("publishes only after staged function source cleanup succeeds", async () => {
    const { auth, conversation, frame, sandbox } = await setup();
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
      conversation,
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
      conversation,
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
    const { auth, conversation, frame } = await setup();
    vi.mocked(buildSandboxFunctionOnReadySandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("build_failed", "Invalid export."))
    );

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
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
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalledTimes(1);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBeUndefined();
  });

  it("keeps the active publication when the UI build fails", async () => {
    const { auth, conversation, frame } = await setup();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      name: "Task List",
      description: "Track tasks.",
    });

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
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
    expect(ensureConversationSandboxReadyWithScope).not.toHaveBeenCalled();
    expect(buildSandboxFunctionOnReadySandbox).not.toHaveBeenCalled();
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      activePublicationId
    );
  });

  it("rejects an unsafe snapshot path before staging or building", async () => {
    const { auth, conversation, frame, sandbox } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
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
    expect(ensureConversationSandboxReadyWithScope).not.toHaveBeenCalled();
    expect(sandbox.writeFile).not.toHaveBeenCalled();
    expect(buildSandboxFunctionOnReadySandbox).not.toHaveBeenCalled();
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
