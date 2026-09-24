import {
  buildInteractiveContentFileNotification,
  interactiveContentRevision,
} from "@app/lib/api/actions/servers/interactive_content/helpers";
import type { FileResource } from "@app/lib/resources/file_resource";
import { frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

function fakeFrame(
  overrides: {
    activePublicationId?: string;
    updatedAtMs?: number;
    sId?: string;
  } = {}
): FileResource {
  const {
    activePublicationId,
    updatedAtMs = 1_700_000_000_000,
    sId = "fil_test",
  } = overrides;

  return {
    sId,
    contentType: frameV2ContentType,
    updatedAtMs,
    useCaseMetadata: activePublicationId ? { activePublicationId } : {},
  } as FileResource;
}

describe("interactiveContentRevision", () => {
  it("prefers the active publication id over File.updatedAtMs", () => {
    const frame = fakeFrame({ activePublicationId: "pub-abc" });

    expect(interactiveContentRevision(frame)).toBe("pub-abc");
    expect(interactiveContentRevision(frame, "forced")).toBe("forced");
  });

  it("falls back to updatedAtMs when no active publication exists", () => {
    const frame = fakeFrame({ updatedAtMs: 42 });

    expect(interactiveContentRevision(frame)).toBe("42");
  });
});

describe("buildInteractiveContentFileNotification", () => {
  it("writes the content revision into updatedAt for panel cache busting", () => {
    const frame = fakeFrame({
      activePublicationId: "pub-abc",
      sId: "fil_frame",
    });

    const notification = buildInteractiveContentFileNotification(
      "token-1",
      frame,
      "Opening Frame...",
      { contentRevision: "1710000000000" }
    );

    expect(notification.params._meta?.data.output).toMatchObject({
      type: "interactive_content_file",
      fileId: "fil_frame",
      updatedAt: "1710000000000",
    });
  });

  it("defaults updatedAt to the active publication id", () => {
    const frame = fakeFrame({ activePublicationId: "pub-abc" });

    const notification = buildInteractiveContentFileNotification(
      "token-1",
      frame,
      "Published Frame"
    );

    expect(notification.params._meta?.data.output).toMatchObject({
      updatedAt: "pub-abc",
    });
  });
});
