import { listPodApps } from "@app/lib/api/projects/apps";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

const MANIFEST = {
  version: 1,
  name: "Task List",
  description: "Track and manage team tasks.",
  functions: [
    {
      name: "add-task",
      path: "src/add.ts",
      description: "Add.",
      executionMode: "fast",
    },
  ],
};

function seedFolders(
  folders: { folder: string; relPaths: string[] }[],
  manifestByFolder: Record<string, unknown>
) {
  fileStorageMock.setFilesByPrefix((prefix) =>
    folders.flatMap(({ folder, relPaths }) =>
      relPaths.map((relPath) => ({
        name: `${prefix}${folder}/${relPath}`,
        metadata: { contentType: "text/plain", size: "10" },
      }))
    )
  );
  fileStorageMock.setFileContent((filePath) => {
    for (const [folder, manifest] of Object.entries(manifestByFolder)) {
      if (filePath.endsWith(`${folder}/manifest.json`)) {
        return JSON.stringify(manifest);
      }
    }
    return null;
  });
}

beforeEach(() => {
  fileStorageMock.reset();
  fileStorageMock.setFetchFileContentNotFound(() => true);
});

describe("listPodApps with manifests", () => {
  it("lists a folder holding only a manifest and sources as an app, with its metadata", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    // No functions/ or databases/ subfolder, no frame: only the manifest makes this an app.
    seedFolders(
      [{ folder: "TaskList", relPaths: ["manifest.json", "src/add.ts"] }],
      { TaskList: MANIFEST }
    );

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      prefix: "tasklist",
      name: "TaskList",
      displayName: "Task List",
      description: "Track and manage team tasks.",
      manifestError: null,
    });
  });

  it("keeps listing a folder whose manifest is malformed, with a manifestError", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    seedFolders(
      [
        {
          folder: "Broken",
          relPaths: ["manifest.json", "functions/x.ts"],
        },
      ],
      { Broken: { version: 99 } }
    );

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].displayName).toBeNull();
    expect(result.value[0].manifestError).not.toBeNull();
  });

  it("lists a folder holding ONLY a malformed manifest, with a manifestError", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    // No functions/ or databases/ subfolder, no frame: the malformed manifest alone must still
    // make this an app, via the manifestPath disjunct rather than the legacy heuristic.
    seedFolders([{ folder: "Broken", relPaths: ["manifest.json"] }], {
      Broken: { version: 99 },
    });

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].prefix).toEqual("broken");
    expect(result.value[0].displayName).toBeNull();
    expect(result.value[0].manifestError).not.toBeNull();
  });

  it("leaves manifest-less folders on the legacy heuristic", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    seedFolders(
      [
        { folder: "Legacy", relPaths: ["functions/greet.ts"] },
        { folder: "NotAnApp", relPaths: ["notes.txt"] },
      ],
      {}
    );

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.map((app) => app.prefix)).toEqual(["legacy"]);
    expect(result.value[0].displayName).toBeNull();
    expect(result.value[0].manifestError).toBeNull();
  });

  it("lists a manifest-declared frame nested in a subfolder", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    const manifest = { ...MANIFEST, uiEntryPoint: "ui/Dashboard.tsx" };
    // The entry's storage content type is "text/plain", not a Frame MIME type, to prove that a
    // manifest-declared frame is listed regardless of the storage object's guessed content type.
    fileStorageMock.setFilesByPrefix((prefix) => [
      {
        name: `${prefix}Dash/manifest.json`,
        metadata: { contentType: "text/plain", size: "10" },
      },
      {
        name: `${prefix}Dash/ui/Dashboard.tsx`,
        metadata: { contentType: "text/plain", size: "10" },
      },
      {
        name: `${prefix}Dash/src/add.ts`,
        metadata: { contentType: "text/plain", size: "10" },
      },
    ]);
    fileStorageMock.setFileContent((filePath) =>
      filePath.endsWith("Dash/manifest.json") ? JSON.stringify(manifest) : null
    );

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value).toHaveLength(1);
    const frame = result.value[0].frames.find((f) =>
      f.path.endsWith("ui/Dashboard.tsx")
    );
    expect(frame).toBeDefined();
    expect(frame?.fileName).toBe("Dashboard.tsx");
  });

  it("still lists a top-level frame the manifest does not declare (union semantics)", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    const manifest = { ...MANIFEST };
    fileStorageMock.setFilesByPrefix((prefix) => [
      {
        name: `${prefix}Board/manifest.json`,
        metadata: { contentType: "text/plain", size: "10" },
      },
      {
        name: `${prefix}Board/Board.tsx`,
        metadata: { contentType: "application/vnd.dust.frame", size: "10" },
      },
      {
        name: `${prefix}Board/src/add.ts`,
        metadata: { contentType: "text/plain", size: "10" },
      },
    ]);
    fileStorageMock.setFileContent((filePath) =>
      filePath.endsWith("Board/manifest.json") ? JSON.stringify(manifest) : null
    );

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].frames.map((f) => f.fileName)).toContain(
      "Board.tsx"
    );
  });

  it("lists the defaulted index.tsx entry point when uiEntryPoint is omitted", async () => {
    const { auth, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    assert(pod);
    // No uiEntryPoint declared, but an index.tsx sits at the folder root: it resolves to the
    // default entry point and must be listed, even though its storage MIME type is not a Frame's
    // (the manifest-declared path is authoritative, same as an explicit uiEntryPoint).
    fileStorageMock.setFilesByPrefix((prefix) => [
      {
        name: `${prefix}Dashboard/manifest.json`,
        metadata: { contentType: "text/plain", size: "10" },
      },
      {
        name: `${prefix}Dashboard/index.tsx`,
        metadata: { contentType: "text/plain", size: "10" },
      },
      {
        name: `${prefix}Dashboard/src/add.ts`,
        metadata: { contentType: "text/plain", size: "10" },
      },
    ]);
    fileStorageMock.setFileContent((filePath) =>
      filePath.endsWith("Dashboard/manifest.json")
        ? JSON.stringify(MANIFEST)
        : null
    );

    const result = await listPodApps(auth, pod);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].frames.map((f) => f.fileName)).toContain(
      "index.tsx"
    );
  });
});
