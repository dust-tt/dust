import { screenshotInteractiveContentFile } from "@app/lib/api/files/screenshot";
import {
  buildFrameOgImagePublicUrl,
  generateAndStoreFrameOgImage,
  getFrameOgImagePublicUrlIfExists,
  getFrameOgImageState,
} from "@app/lib/api/frames/og";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { getFrameOgImagePath } from "@app/types/api/frame_storage";
import { frameContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/files/screenshot", () => ({
  screenshotInteractiveContentFile: vi.fn(),
}));

vi.mock("@app/temporal/frame_og/client", async () => {
  const { Ok } = await import("@app/types/shared/result");
  return {
    launchGenerateFrameOgImageWorkflow: vi
      .fn()
      .mockResolvedValue(new Ok(undefined)),
  };
});

describe("Frame OG helpers", () => {
  it("buildFrameOgImagePublicUrl includes the share token and optional version", () => {
    expect(buildFrameOgImagePublicUrl({ token: "tok_abc" })).toContain(
      "/api/v1/public/frames/tok_abc/og"
    );
    expect(
      buildFrameOgImagePublicUrl({ token: "tok_abc" }, { version: "42" })
    ).toContain("?v=42");
  });

  it("getFrameOgImageState returns null when the object is missing", async () => {
    fileStorageMock.setFileExists(() => false);

    const state = await getFrameOgImageState({
      workspaceId: "w_1",
      frameId: "fil_1",
    });

    expect(state.isOk()).toBe(true);
    if (state.isOk()) {
      expect(state.value).toBeNull();
    }
  });

  it("getFrameOgImagePublicUrlIfExists returns a versioned URL when present", async () => {
    const ogPath = getFrameOgImagePath({
      workspaceId: "w_1",
      frameId: "fil_1",
    });
    fileStorageMock.setFileMetadata((path) =>
      path === ogPath
        ? { contentType: "image/png", size: "10", generation: "99" }
        : null
    );

    const url = await getFrameOgImagePublicUrlIfExists({
      workspaceId: "w_1",
      frameId: "fil_1",
      token: "tok_1",
    });

    expect(url).toContain("/api/v1/public/frames/tok_1/og?v=99");
  });

  it("generateAndStoreFrameOgImage screenshots and writes PNG bytes", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const frame = await FileFactory.create(authenticator, user, {
      contentType: frameContentType,
      fileName: "demo.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    vi.mocked(screenshotInteractiveContentFile).mockResolvedValue(
      new Ok({ buffer: Buffer.from("png-bytes"), fileName: "demo.png" })
    );

    const result = await generateAndStoreFrameOgImage(authenticator, frame);

    expect(result.isOk()).toBe(true);
    expect(screenshotInteractiveContentFile).toHaveBeenCalledWith(
      authenticator,
      { fileId: frame.sId }
    );

    const expectedPath = getFrameOgImagePath({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
      frameId: frame.sId,
    });
    expect(
      fileStorageMock.saveFileCalls.some(
        (call) =>
          call.filePath === expectedPath && call.contentType === "image/png"
      )
    ).toBe(true);
  });

  it("generateAndStoreFrameOgImage surfaces screenshot failures", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });
    const frame = await FileFactory.create(authenticator, user, {
      contentType: frameContentType,
      fileName: "demo.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    vi.mocked(screenshotInteractiveContentFile).mockResolvedValue(
      new Err({ type: "render_failed", message: "Gotenberg down" })
    );

    const result = await generateAndStoreFrameOgImage(authenticator, frame);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Gotenberg down");
    }
  });
});
