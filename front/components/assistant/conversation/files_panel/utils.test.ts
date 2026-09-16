import { resolveFilePreviewPath } from "@app/components/assistant/conversation/files_panel/utils";
import { describe, expect, it } from "vitest";

const conversation = { sId: "sFZJcZy1us", spaceId: "spc_1" };

describe("resolveFilePreviewPath", () => {
  it("canonicalizes the legacy scoped path an agent writes in a message", () => {
    expect(
      resolveFilePreviewPath({
        conversation,
        filePath: "conversation/another_random.xlsx",
      })
    ).toBe("conversation-sFZJcZy1us/another_random.xlsx");
  });

  it("keeps the canonical path the files panel already provides", () => {
    expect(
      resolveFilePreviewPath({
        conversation,
        filePath: "conversation-sFZJcZy1us/another_random.xlsx",
      })
    ).toBe("conversation-sFZJcZy1us/another_random.xlsx");
  });

  it("canonicalizes a pod-scoped path against the conversation's space", () => {
    expect(
      resolveFilePreviewPath({
        conversation,
        filePath: "pod/spec.md",
      })
    ).toBe("pod-spc_1/spec.md");
  });

  it("returns null for a file addressed by id only", () => {
    expect(
      resolveFilePreviewPath({
        conversation,
        filePath: undefined,
      })
    ).toBeNull();
  });
});
