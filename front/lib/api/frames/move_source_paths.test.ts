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

  it("rejects identical and nested destinations after trimming trailing slashes", () => {
    const identical = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status/",
      destinationDirectoryPath: "conversation-conv_123/Status",
    });
    const nested = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status/",
      destinationDirectoryPath: "conversation-conv_123/Status/Nested",
    });

    expect(identical.isErr() && identical.error).toMatchObject({
      code: "invalid_source",
    });
    expect(nested.isErr() && nested.error).toMatchObject({
      code: "invalid_source",
    });
  });

  it("resolves saving a conversation Frame to a Pod", () => {
    const result = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Reports/Status",
      destinationDirectoryPath: "pod-pod_123/Status",
    });

    expect(result.isOk() && result.value).toMatchObject({
      auditEvent: {
        parentRelativePath: "",
        relativeFilePath: "Reports/Status",
      },
      destinationManifestPath: "pod-pod_123/Status/manifest.json",
      destinationScope: { useCase: "pod", podId: "pod_123" },
      savedToPodId: "pod_123",
    });
  });

  it("does not mark a move within one Pod as a save to it", () => {
    const result = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "pod-pod_123/Status",
      destinationDirectoryPath: "pod-pod_123/Renamed",
    });

    expect(result.isOk() && result.value.savedToPodId).toBeNull();
  });

  it("rejects nested and other cross-mount destinations", () => {
    const nested = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status",
      destinationDirectoryPath: "conversation-conv_123/Status/Nested",
    });
    const podToConversation = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "pod-pod_123/Status",
      destinationDirectoryPath: "conversation-conv_123/Status",
    });
    const podToPod = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "pod-pod_123/Status",
      destinationDirectoryPath: "pod-pod_456/Status",
    });
    const conversationToConversation = resolveFrameSourceMovePaths({
      sourceDirectoryPath: "conversation-conv_123/Status",
      destinationDirectoryPath: "conversation-conv_456/Status",
    });

    for (const result of [
      nested,
      podToConversation,
      podToPod,
      conversationToConversation,
    ]) {
      expect(result.isErr() && result.error).toMatchObject({
        code: "invalid_source",
      });
    }
  });
});
