import { prewarmFrameSandbox } from "@app/lib/api/frames/prewarm_frame_sandbox";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/sandbox/lifecycle"), async (importOriginal) => ({
  ...(await importOriginal()),
  ensureFrameSandboxReady: vi.fn(),
}));

describe("prewarmFrameSandbox", () => {
  beforeEach(() => {
    vi.mocked(ensureFrameSandboxReady).mockReset();
  });

  it("wakes the sandbox without creating one for a viewer who can call the Frame", async () => {
    const { auth, frame } = await makeTestFrameFunction();

    await prewarmFrameSandbox(auth, frame);

    expect(ensureFrameSandboxReady).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ sId: frame.sId }),
      { wakeOnly: true }
    );
  });

  it("does nothing for a viewer who may not use the Frame", async () => {
    const { auth, frame } = await makeTestFrameFunction({
      shareScope: "emails_only",
    });

    await prewarmFrameSandbox(auth, frame);

    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("does nothing when the active publication declares no function", async () => {
    const { auth, frame } = await makeTestFrameFunction();
    await frame.setActiveFramePublication({
      publicationId: "publication-without-functions",
      description: "Track tasks.",
    });

    await prewarmFrameSandbox(auth, frame);

    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("resolves when readiness throws", async () => {
    const { auth, frame } = await makeTestFrameFunction();
    vi.mocked(ensureFrameSandboxReady).mockRejectedValueOnce(
      new Error("provider unavailable")
    );

    await expect(prewarmFrameSandbox(auth, frame)).resolves.toBeUndefined();
  });
});
