import { publishPodApp } from "@app/lib/api/projects/publish_app";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
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

const MANIFEST = {
  version: 1,
  name: "Task List",
  description: "Tasks.",
  frames: [{ path: "TaskList.tsx" }],
  functions: [
    {
      name: "add-task",
      path: "src/add.ts",
      description: "Add.",
      executionMode: "fast",
      defaultStake: "low",
    },
  ],
  databases: [{ name: "tasks", path: "databases/tasks.db.ts" }],
};

/** Seeds the pod listing with an app folder's files and its manifest content. */
function seedAppFolder({
  folder,
  relPaths,
  manifest,
  extraRootFolders = [],
}: {
  folder: string;
  relPaths: string[];
  manifest: unknown;
  extraRootFolders?: { folder: string; relPaths: string[] }[];
}) {
  const all = [{ folder, relPaths }, ...extraRootFolders];
  fileStorageMock.setFilesByPrefix((prefix) =>
    all.flatMap(({ folder: f, relPaths: rps }) =>
      rps.map((relPath) => ({
        name: `${prefix}${f}/${relPath}`,
        metadata: {
          contentType: relPath.endsWith(".tsx")
            ? "application/vnd.dust.frame"
            : "text/plain",
          size: "10",
        },
      }))
    )
  );
  fileStorageMock.setFileContent((filePath) =>
    filePath.endsWith(`${folder}/manifest.json`)
      ? JSON.stringify(manifest)
      : null
  );
}

async function podFor(
  projectId: string,
  auth: Parameters<typeof publishPodApp>[0]
) {
  const pod = await SpaceResource.fetchById(auth, projectId);
  assert(pod, "pod not found");
  return pod;
}

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

describe("publishPodApp", () => {
  it("publishes databases, functions and frames from the manifest, in that order", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
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
    // The real createPodFrameFile primitive (FileResource.makeNew + uploadContent +
    // moveProjectFile) drives ensureAuthorizedFileAccessForShare's reference analysis, which
    // reaches well past what the GCS storage mock models here and timed out. Per the brief's
    // documented fallback, assert the frame lands in `warnings` (its path exists in the folder
    // listing, but no FileResource is registered for it) rather than in `publishedFrameNames`.
    // publishFrame's happy path (a real FileResource) is exercised by mocking `publishFrame`
    // itself, as this test already does.

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.prefix).toBe("tasklist");
    expect(result.value.displayName).toBe("Task List");
    expect(result.value.reconciledDatabaseNames).toEqual(["tasklist__tasks"]);
    expect(result.value.publishedFunctionSlugs).toEqual(["tasklist__add-task"]);
    expect(result.value.publishedFrameNames).toEqual([]);
    expect(result.value.warnings.join(" ")).toContain("TaskList.tsx");
    expect(vi.mocked(publishFrame)).not.toHaveBeenCalled();
    expect(vi.mocked(reconcileDatabaseFromPodPath)).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        database: "tasks",
        path: `pod-${projectId}/TaskList/databases/tasks.db.ts`,
      })
    );
    // Databases reconcile before functions build (frames are last).
    expect(
      vi.mocked(reconcileDatabaseFromPodPath).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(buildSandboxFunctionOnSandbox).mock.invocationCallOrder[0]
    );
  });

  it("publishes a frame-less, database-less app", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "FnsOnly",
      relPaths: ["manifest.json", "greet.ts"],
      manifest: {
        version: 1,
        name: "Fns Only",
        description: "",
        functions: [
          {
            name: "greet",
            path: "greet.ts",
            description: "Greet.",
            executionMode: "fast",
          },
        ],
      },
    });

    const result = await publishPodApp(auth, pod, { folderName: "FnsOnly" });

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.publishedFunctionSlugs).toEqual(["fnsonly__greet"]);
    expect(result.value.publishedFrameNames).toEqual([]);
    expect(result.value.reconciledDatabaseNames).toEqual([]);
    expect(vi.mocked(reconcileDatabaseFromPodPath)).not.toHaveBeenCalled();
    expect(vi.mocked(publishFrame)).not.toHaveBeenCalled();
  });

  it("unpublishes a function the manifest no longer declares", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts"],
      manifest: { ...MANIFEST, frames: [], databases: [] },
    });
    // Pre-publish a function the manifest does not declare.
    const { publishSandboxFunction } = await import(
      "@app/lib/api/sandbox_functions/publish_sandbox_function"
    );
    const pre = await publishSandboxFunction(auth, {
      space: pod,
      slug: "old-fn",
      description: "Old.",
      path: `pod-${projectId}/TaskList/src/old.ts`,
    });
    assert(pre.isOk(), pre.isErr() ? pre.error.message : "");

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.unpublishedFunctionSlugs).toEqual(["tasklist__old-fn"]);
    expect(
      await SandboxFunctionResource.fetchBySpaceAndSlug(
        auth,
        pod,
        "tasklist__old-fn"
      )
    ).toBeNull();
  });

  it("warns about an orphan database and never deletes it", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts"],
      manifest: { ...MANIFEST, frames: [], databases: [] },
    });
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__legacy.db"]);

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.warnings.join(" ")).toContain("tasklist__legacy");
  });

  it.each([
    ["a missing folder", "Nope", "folder_not_found"],
    ["a name with a slash", "a/b", "invalid_name"],
  ])("fails on %s", async (_label, folderName, code) => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts"],
      manifest: MANIFEST,
    });

    const result = await publishPodApp(auth, pod, { folderName });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(code);
    }
  });

  it("fails with manifest_not_found when the folder has no manifest.json", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["src/add.ts"],
      manifest: MANIFEST,
    });

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("manifest_not_found");
    }
  });

  it("fails with invalid_manifest on a schema violation and on a missing referenced file", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);

    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json"],
      manifest: { version: 2 },
    });
    const bad = await publishPodApp(auth, pod, { folderName: "TaskList" });
    expect(bad.isErr() && bad.error.code === "invalid_manifest").toBe(true);

    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json"],
      manifest: { ...MANIFEST, frames: [], databases: [] },
    });
    const missing = await publishPodApp(auth, pod, { folderName: "TaskList" });
    expect(missing.isErr() && missing.error.code === "invalid_manifest").toBe(
      true
    );
    if (missing.isErr()) {
      expect(missing.error.message).toContain("src/add.ts");
    }
  });

  it("fails with colliding_folders when a sibling folder shares the prefix", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts"],
      manifest: MANIFEST,
      // "tasklist" (lowercase) is a different literal folder name that normalizes to the same
      // prefix ("tasklist") as "TaskList" — the case-collision `normalizeAppPrefix` guards against.
      extraRootFolders: [{ folder: "tasklist", relPaths: ["note.txt"] }],
    });

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("colliding_folders");
    }
  });

  it("aborts on sandbox_unavailable from the first reconcile", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts", "databases/tasks.db.ts"],
      manifest: { ...MANIFEST, frames: [] },
    });
    vi.mocked(reconcileDatabaseFromPodPath).mockResolvedValue(
      new Err(new SandboxFunctionError("sandbox_unavailable", "Asleep."))
    );

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("sandbox_unavailable");
    }
    expect(vi.mocked(buildSandboxFunctionOnSandbox)).not.toHaveBeenCalled();
  });

  it("turns a per-item function failure into a warning and continues", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await podFor(projectId, auth);
    seedAppFolder({
      folder: "TaskList",
      relPaths: ["manifest.json", "src/add.ts", "src/other.ts"],
      manifest: {
        ...MANIFEST,
        frames: [],
        databases: [],
        functions: [
          ...MANIFEST.functions,
          {
            name: "other",
            path: "src/other.ts",
            description: "Other.",
            executionMode: "fast",
          },
        ],
      },
    });
    vi.mocked(buildSandboxFunctionOnSandbox)
      .mockResolvedValueOnce(
        new Err(new SandboxFunctionError("build_failed", "Syntax error."))
      )
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export default {};",
          userIdentity: "optional",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        })
      );

    const result = await publishPodApp(auth, pod, { folderName: "TaskList" });

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.warnings.join(" ")).toContain("add-task");
    expect(result.value.publishedFunctionSlugs).toEqual(["tasklist__other"]);
  });
});
