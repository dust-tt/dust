import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { frameV2ContentType } from "@app/types/files";
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
});
