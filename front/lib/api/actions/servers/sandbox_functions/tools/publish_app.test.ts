import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { publishAppHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish_app";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  MANIFEST,
  seedAppFolder,
} from "@app/tests/utils/pod_app_publish_test_helpers";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/sandbox_functions/build_on_sandbox",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/build_on_sandbox")
      >();
    return { ...actual, buildSandboxFunctionOnSandbox: vi.fn() };
  }
);

vi.mock("@app/lib/api/sandbox_functions/dsbx_db", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/dsbx_db")
    >();
  return { ...actual, reconcileDatabaseFromPodPath: vi.fn() };
});

vi.mock("@app/lib/api/viz/publish_frame", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/viz/publish_frame")>();
  return { ...actual, publishFrame: vi.fn() };
});

vi.mock("@app/lib/lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async (
      _lockName: string,
      callback: () => Promise<unknown>
    ) => callback(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
  fileStorageMock.setFetchFileContentNotFound(() => true);
  vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
    new Ok({
      bundleCode: "export default {};",
      userIdentity: "optional",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    })
  );
  vi.mocked(reconcileDatabaseFromPodPath).mockResolvedValue(
    new Ok({ database: "tasklist__tasks", created: true, statements: [] })
  );
  vi.mocked(publishFrame).mockResolvedValue(new Ok({ warnings: [] }));
});

describe("publishAppHandler", () => {
  it("publishes the app and reports the summary", async () => {
    const { auth, conversation } = await setupProjectConversation();
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts", "databases/tasks.db.ts"],
      manifest: { ...MANIFEST, frames: [] },
    });

    const result = await publishAppHandler(
      { folder: "TaskList" },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    const [block] = result.value;
    if (block?.type !== "text") {
      throw new Error("Expected a text block.");
    }
    expect(block.text).toContain('Published app "TaskList" (prefix: tasklist)');
    expect(block.text).toContain("tasklist__add-task");
    expect(block.text).toContain("tasklist__tasks");
  });

  it("publishes a manifest-declared frame that has a real FileResource", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    seedAppFolder({
      folder: "TaskList",
      relPaths: [
        "manifest.json",
        "TaskList.tsx",
        "src/add.ts",
        "databases/tasks.db.ts",
      ],
      manifest: MANIFEST,
    });
    const workspaceId = auth.getNonNullableWorkspace().sId;
    await FileFactory.create(auth, auth.user(), {
      contentType: "application/vnd.dust.frame",
      fileName: "TaskList.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: projectId },
      mountFilePath: `w/${workspaceId}/pods/${projectId}/files/TaskList/TaskList.tsx`,
    });

    const result = await publishAppHandler(
      { folder: "TaskList" },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    const [block] = result.value;
    if (block?.type !== "text") {
      throw new Error("Expected a text block.");
    }
    expect(block.text).toContain("Frames published: TaskList.tsx");
  });

  it("tells the model to write a manifest when the folder has none", async () => {
    const { auth, conversation } = await setupProjectConversation();
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["src/add.ts"],
      manifest: MANIFEST,
    });

    const result = await publishAppHandler(
      { folder: "TaskList" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("manifest.json");
    }
  });

  it("declares a folder-only schema", () => {
    const metadata = SANDBOX_FUNCTIONS_TOOLS_METADATA.find(
      (tool) => tool.name === "publish_app"
    );
    expect(metadata).toBeDefined();
    expect(metadata?.schema.folder.safeParse("TaskList").success).toBe(true);
    expect(metadata?.schema.folder.safeParse("").success).toBe(false);
  });
});
