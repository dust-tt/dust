import { prewarmFrameSandbox } from "@app/lib/api/frames/prewarm_frame_sandbox";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/frames/prewarm_frame_sandbox"), () => ({
  prewarmFrameSandbox: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/w/:wId/frames/:frameId/prewarm", () => {
  beforeEach(() => {
    vi.mocked(prewarmFrameSandbox).mockClear();
  });

  it("starts the pre-warm for a Frame v2 and returns without waiting", async () => {
    const { workspace, frame } = await makeTestFrameFunction();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/prewarm`,
      { method: "POST" }
    );

    expect(response.status).toBe(202);
    expect(prewarmFrameSandbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sId: frame.sId })
    );
  });

  it("returns 404 for a legacy Frame", async () => {
    const { auth, workspace } = await makeTestFrameFunction();
    const legacyFrame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "frame.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${legacyFrame.sId}/prewarm`,
      { method: "POST" }
    );

    expect(response.status).toBe(404);
    expect(prewarmFrameSandbox).not.toHaveBeenCalled();
  });
});
