import {
  getFrameBasePath,
  getFrameDatabaseReplicaBasePath,
  getFramePublicationDescriptorPath,
  getFramePublicationFunctionBundlePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { describe, expect, it } from "vitest";

const IDS = {
  workspaceId: "w_123",
  frameId: "fil_456",
  publicationId: "b8c2b796-534a-4ad2-a5ad-071da692ca0b",
};

describe("Frames v2 GCS paths", () => {
  it("keeps publications under the Frame identity", () => {
    expect(getFrameBasePath(IDS)).toBe("w/w_123/frames/fil_456/");
    expect(getFramePublicationDescriptorPath(IDS)).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/publication.json"
    );
    expect(getFramePublicationUiBundlePath(IDS)).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/ui/bundle.js"
    );
    expect(
      getFramePublicationFunctionBundlePath({
        ...IDS,
        functionName: "add-task",
      })
    ).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/functions/add-task.ts"
    );
  });

  it("keeps SQLite replica state outside publications", () => {
    expect(
      getFrameDatabaseReplicaBasePath({
        workspaceId: IDS.workspaceId,
        frameId: IDS.frameId,
        databaseName: "task_store",
      })
    ).toBe("w/w_123/frames/fil_456/state/databases/task_store.db/");
  });

  it("rejects path traversal and unsafe identity segments", () => {
    expect(() =>
      getFrameBasePath({ workspaceId: "../other", frameId: IDS.frameId })
    ).toThrow("Invalid workspaceId");
    expect(() =>
      getFramePublicationFunctionBundlePath({
        ...IDS,
        functionName: "../other",
      })
    ).toThrow("Invalid functionName");
    expect(() =>
      getFrameDatabaseReplicaBasePath({
        workspaceId: IDS.workspaceId,
        frameId: IDS.frameId,
        databaseName: "../other",
      })
    ).toThrow("Invalid databaseName");
  });
});
