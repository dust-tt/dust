import { resolveMarkdownImageSource } from "@app/components/markdown/image_source";
import { getFilePathViewUrl, getFileProcessedUrl } from "@app/lib/swr/files";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("resolveMarkdownImageSource", () => {
  const owner = LightWorkspaceFactory.build({ sId: "w1" });

  it("resolves a conversation or pod file to the file API, percent-decoded", () => {
    expect(
      resolveMarkdownImageSource(owner, "pod-p1/charts/my%20chart.png")
    ).toEqual({
      kind: "file_path",
      filePath: "pod-p1/charts/my chart.png",
      url: getFilePathViewUrl(owner, "pod-p1/charts/my chart.png"),
    });
    expect(
      resolveMarkdownImageSource(owner, "conversation-c1/fil_abcdefghij.png")
    ).toEqual({
      kind: "file_path",
      filePath: "conversation-c1/fil_abcdefghij.png",
      url: getFilePathViewUrl(owner, "conversation-c1/fil_abcdefghij.png"),
    });
  });

  it("resolves a file id to its processed version, from the id alone", () => {
    for (const src of [
      "fil_abcdefghij",
      "https://example.com/files/fil_abcdefghij?action=view",
    ]) {
      expect(resolveMarkdownImageSource(owner, src)).toEqual({
        kind: "file_id",
        fileId: "fil_abcdefghij",
        url: getFileProcessedUrl(owner, "fil_abcdefghij"),
      });
    }
  });

  it("resolves no other source", () => {
    for (const src of [
      "https://example.com/logo.png",
      "/api/w/w1/members",
      "chart.png",
      "conversation/chart.png",
      "pod-p1",
      "pod-p1/",
      "pod-p1/../../members",
      "pod-p1/%2E%2E/x.png",
      "pod-p1/%E0%A4%A.png",
      "fil_short",
      "fil_abcdefghij/fil_klmnopqrst",
    ]) {
      expect(resolveMarkdownImageSource(owner, src)).toBeNull();
    }
  });
});
