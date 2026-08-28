import {
  getFrameBasePath,
  getFramePublicationFunctionBundlePath,
  getFramePublicationFunctionSchemaPath,
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
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
    expect(getFramePublicationUiBundlePath(IDS)).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/ui/bundle.js"
    );
    expect(
      getFramePublicationFunctionBundlePath({
        ...IDS,
        functionName: "add-task",
      })
    ).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/functions/add-task/bundle.js"
    );
    expect(
      getFramePublicationFunctionSchemaPath({
        ...IDS,
        functionName: "add-task",
      })
    ).toBe(
      "w/w_123/frames/fil_456/publications/b8c2b796-534a-4ad2-a5ad-071da692ca0b/functions/add-task/schema.json"
    );
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
    expect(() =>
      getFramePublicationFunctionBundlePath({
        ...IDS,
        functionName: "../other",
      })
    ).toThrow("Invalid functionName");
  });
});
