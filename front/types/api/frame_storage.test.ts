import {
  getFrameBasePath,
  getFrameDatabaseStateBasePath,
  getFrameInvocationPath,
  getFramePublicationFunctionArtifactsBasePath,
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
  getFramePublicationUiArtifactsBasePath,
} from "@app/types/api/frame_storage";
import { describe, expect, it } from "vitest";

const IDS = {
  workspaceId: "w_123",
  frameId: "fil_456",
  publicationId: "b8c2b796-534a-4ad2-a5ad-071da692ca0b",
};

describe("Frames v2 GCS paths", () => {
  it("keeps publications, state, and invocations under the Frame identity", () => {
    expect(getFrameBasePath(IDS)).toBe("w/w_123/frames/fil_456/");
    expect(getFramePublicationManifestPath(IDS)).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/manifest.json"
    );
    expect(
      getFramePublicationSourcePath({
        ...IDS,
        relativePath: "src/index.tsx",
      })
    ).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/source/src/index.tsx"
    );
    expect(getFramePublicationUiArtifactsBasePath(IDS)).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/artifacts/ui/"
    );
    expect(
      getFramePublicationFunctionArtifactsBasePath({
        ...IDS,
        functionName: "add-task",
      })
    ).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/artifacts/functions/add-task/"
    );
    expect(
      getFrameDatabaseStateBasePath({
        workspaceId: IDS.workspaceId,
        frameId: IDS.frameId,
        databaseName: "tasks",
      })
    ).toBe("w/w_123/frames/fil_456/state/databases/tasks/");
    expect(
      getFrameInvocationPath({
        workspaceId: IDS.workspaceId,
        frameId: IDS.frameId,
        invocationId: "inv_789",
      })
    ).toBe("w/w_123/frames/fil_456/invocations/inv_789");
  });

  it("rejects path traversal and unsafe identity segments", () => {
    expect(() =>
      getFramePublicationSourcePath({
        ...IDS,
        relativePath: "../secret",
      })
    ).toThrow("Invalid relative source path");
    expect(() =>
      getFrameBasePath({ workspaceId: "../other", frameId: IDS.frameId })
    ).toThrow("Invalid workspaceId");
  });
});
