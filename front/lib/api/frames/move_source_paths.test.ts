// @vitest-environment node

import { resolveFrameSourceMovePaths } from "@app/lib/api/frames/move_source_paths";
import { describe, expect, it } from "vitest";

describe("resolveFrameSourceMovePaths", () => {
  it("resolves normalized paths and audit metadata in one conversation", () => {
    const result = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status",
      destinationDirectoryPath: "conversation-conv_123/Archive/Renamed",
    });

    expect(result.isOk() && result.value).toMatchObject({
      auditEvent: {
        parentRelativePath: "Archive",
        relativeFilePath: "Status",
      },
      destinationDirectoryPath: "conversation-conv_123/Archive/Renamed",
      destinationManifestPath:
        "conversation-conv_123/Archive/Renamed/manifest.json",
      destinationScope: {
        useCase: "conversation",
        conversationId: "conv_123",
      },
      sourceDirectoryPath: "conversation-conv_123/Status",
      sourceManifestPath: "conversation-conv_123/Status/manifest.json",
    });
  });

  it("resolves a move in one Pod", () => {
    const result = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "pod-pod_123/Status",
      destinationDirectoryPath: "pod-pod_123/Renamed",
    });

    expect(result.isOk() && result.value.destinationScope).toEqual({
      useCase: "pod",
      podId: "pod_123",
    });
  });

  it("accepts nested folder paths with trailing slashes", () => {
    const result = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status/",
      destinationDirectoryPath: "conversation-conv_123/Archive/Renamed/",
    });

    expect(result.isOk() && result.value).toMatchObject({
      destinationManifestPath:
        "conversation-conv_123/Archive/Renamed/manifest.json",
      sourceManifestPath: "conversation-conv_123/Status/manifest.json",
    });
  });

  it("rejects nested and cross-mount destinations", () => {
    const nested = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status",
      destinationDirectoryPath: "conversation-conv_123/Status/Nested",
    });
    const crossMount = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status",
      destinationDirectoryPath: "pod-pod_123/Status",
    });

    expect(nested.isErr() && nested.error).toMatchObject({
      code: "invalid_source",
    });
    expect(crossMount.isErr() && crossMount.error).toMatchObject({
      code: "invalid_source",
    });
  });
});
