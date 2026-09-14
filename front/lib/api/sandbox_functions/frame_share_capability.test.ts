import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { describe, expect, it, vi } from "vitest";

describe("resolveActiveFrameFunctionForUse", () => {
  it("resolves a function from the active publication", async () => {
    const { auth, frame, sandboxFunction } = await makeTestFrameFunction();

    await expect(
      resolveActiveFrameFunctionForUse(auth, {
        frameId: frame.sId,
        functionName: "run-function",
      })
    ).resolves.toMatchObject({ sId: sandboxFunction.sId });
  });

  it("fails closed when the publication changes during resolution", async () => {
    const { auth, frame } = await makeTestFrameFunction();
    const fetchFunction =
      SandboxFunctionResource.fetchByFramePublicationAndSlug.bind(
        SandboxFunctionResource
      );
    vi.spyOn(
      SandboxFunctionResource,
      "fetchByFramePublicationAndSlug"
    ).mockImplementationOnce(async (...args) => {
      await frame.setActiveFramePublication({
        publicationId: "publication-2",
        name: "Task List",
        description: "Track tasks.",
      });
      return fetchFunction(...args);
    });

    await expect(
      resolveActiveFrameFunctionForUse(auth, {
        frameId: frame.sId,
        functionName: "run-function",
      })
    ).resolves.toBeNull();
  });

  it("enforces current Frame use rights", async () => {
    const { auth, frame } = await makeTestFrameFunction({
      shareScope: "emails_only",
    });

    await expect(
      resolveActiveFrameFunctionForUse(auth, {
        frameId: frame.sId,
        functionName: "run-function",
      })
    ).resolves.toBeNull();
  });
});
