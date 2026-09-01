import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("Frames v2 FileResource", () => {
  it("identifies a manifest FileResource by its content type", async () => {
    const { authenticator } = await createResourceTest({});
    const frame = await FileFactory.create(authenticator, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
    });

    expect(frame.isFrameV2).toBe(true);
    expect(frame.isInteractiveContent).toBe(false);
    expect(frame.isShareableFrame).toBe(true);
  });

  it("rebinds a stable shared Frame identity to a v2 manifest", async () => {
    const { authenticator } = await createResourceTest({});
    const frame = await FileFactory.create(authenticator, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 50,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-id" },
      mountFilePath: "/files/legacy.tsx",
    });
    await frame.ensureShareableFrame(authenticator);
    const shareInfo = await frame.getShareInfo();

    await frame.updateFrameSourceBinding({
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      mountFilePath: "/files/status/manifest.json",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-id" },
    });

    expect(frame.isFrameV2).toBe(true);
    expect(frame.fileName).toBe("manifest.json");
    expect(frame.mountFilePath).toBe("/files/status/manifest.json");
    expect(await frame.getShareInfo()).toEqual(shareInfo);
  });
});
