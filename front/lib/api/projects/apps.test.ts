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
});
