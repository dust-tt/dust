import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
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

describe("buildInteractiveContentFileNotification", () => {
  it("prefers contentRevision, then activePublicationId, then updatedAtMs", () => {
    const withPub = fakeFrame({
      activePublicationId: "pub-abc",
      sId: "fil_frame",
    });
    const withoutPub = fakeFrame({ updatedAtMs: 42 });

    expect(
      buildInteractiveContentFileNotification(
        "token-1",
        withPub,
        "Opening Frame...",
        { contentRevision: "1710000000000" }
      ).params._meta?.data.output
    ).toMatchObject({
      type: "interactive_content_file",
      fileId: "fil_frame",
      updatedAt: "1710000000000",
    });

    expect(
      buildInteractiveContentFileNotification("token-1", withPub, "Published")
        .params._meta?.data.output
    ).toMatchObject({ updatedAt: "pub-abc" });

    expect(
      buildInteractiveContentFileNotification(
        "token-1",
        withoutPub,
        "Published"
      ).params._meta?.data.output
    ).toMatchObject({ updatedAt: "42" });
  });

  it("omits autoOpen unless explicitly false", () => {
    const frame = fakeFrame();

    expect(
      buildInteractiveContentFileNotification("t", frame, "Opening Frame...")
        .params._meta?.data.output
    ).not.toHaveProperty("autoOpen");

    expect(
      buildInteractiveContentFileNotification(
        "t",
        frame,
        "Publishing Frame...",
        {
          autoOpen: false,
        }
      ).params._meta?.data.output
    ).toMatchObject({ autoOpen: false });
  });
});
