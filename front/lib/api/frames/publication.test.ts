import {
  loadActiveFramePublication,
  publishFrameFromGCS,
} from "@app/lib/api/frames/publication";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameV2ContentType } from "@app/types/files";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async <T>(_name: string, callback: () => Promise<T>) =>
      callback(),
  };
});

const MANIFEST = {
  version: 1,
  name: "Task List",
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      path: "functions/add-task.ts",
      description: "Add a task.",
      executionMode: "fast",
    },
  ],
  databases: [{ name: "tasks", path: "databases/tasks.db.ts" }],
};

beforeEach(() => {
  fileStorageMock.reset();
});

function seedSource(sourcePrefix: string): void {
  const objects = {
    "manifest.json": JSON.stringify(MANIFEST),
    "index.tsx": "export default function App() { return <div />; }",
    "functions/add-task.ts": "export default async function addTask() {}",
    "databases/tasks.db.ts": "export const tasks = {};",
  };

  for (const [relativePath, content] of Object.entries(objects)) {
    fileStorageMock.setObject(`${sourcePrefix}${relativePath}`, content);
  }
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === sourcePrefix
      ? Object.keys(objects).map((relativePath, index) => ({
          name: `${sourcePrefix}${relativePath}`,
          metadata: { generation: String(index + 1) },
        }))
      : null
  );
}

async function createFrame() {
  const { authenticator } = await createResourceTest({});
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
  });

  return { auth: authenticator, frame };
}

describe("Frames v2 publication storage", () => {
  it("snapshots a source folder, activates it, and loads it by Frame identity", async () => {
    const { auth, frame } = await createFrame();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const sourcePrefix = `w/${workspaceId}/pods/pod_123/files/TaskList/`;
    seedSource(sourcePrefix);

    const publishResult = await publishFrameFromGCS(auth, {
      frame,
      sourcePrefix,
    });

    assert(publishResult.isOk());
    expect(frame.getActiveFramePublicationId()).toBe(
      publishResult.value.publicationId
    );
    expect(
      fileStorageMock.getObject(
        `${publishResult.value.sourceBasePath}index.tsx`
      )
    ).toContain("function App");
    expect(
      JSON.parse(
        fileStorageMock.getObject(
          `${publishResult.value.basePath}manifest.json`
        ) ?? ""
      )
    ).toEqual({ ...MANIFEST, uiEntryPoint: "index.tsx" });

    const reloadedFrame = await FileResource.fetchById(auth, frame.sId);
    assert(reloadedFrame);
    const loadResult = await loadActiveFramePublication(auth, reloadedFrame);
    assert(loadResult.isOk());
    expect(loadResult.value.publicationId).toBe(
      publishResult.value.publicationId
    );
    expect(loadResult.value.manifest.uiEntryPoint).toBe("index.tsx");
  });

  it("keeps the previous publication active when a new snapshot fails", async () => {
    const { auth, frame } = await createFrame();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const firstPrefix = `w/${workspaceId}/pods/pod_123/files/TaskList/`;
    seedSource(firstPrefix);
    const firstResult = await publishFrameFromGCS(auth, {
      frame,
      sourcePrefix: firstPrefix,
    });
    assert(firstResult.isOk());

    const secondPrefix = `w/${workspaceId}/pods/pod_123/files/TaskList-v2/`;
    seedSource(secondPrefix);
    const cleanedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) => {
      cleanedPrefixes.push(prefix);
    });
    fileStorageMock.setCopyFileFails((src) => src.endsWith("index.tsx"));

    const secondResult = await publishFrameFromGCS(auth, {
      frame,
      sourcePrefix: secondPrefix,
    });

    assert(secondResult.isErr());
    expect(secondResult.error.code).toBe("storage_error");
    expect(frame.getActiveFramePublicationId()).toBe(
      firstResult.value.publicationId
    );
    expect(cleanedPrefixes).toHaveLength(1);
    expect(cleanedPrefixes[0]).toContain(
      `w/${workspaceId}/frames/${frame.sId}/publications/`
    );
  });

  it("rejects a source prefix outside the Frame workspace", async () => {
    const { auth, frame } = await createFrame();

    const result = await publishFrameFromGCS(auth, {
      frame,
      sourcePrefix: "w/w_other/pods/pod_123/files/TaskList/",
    });

    assert(result.isErr());
    expect(result.error.code).toBe("invalid_source");
    expect(frame.getActiveFramePublicationId()).toBeNull();
  });
});
