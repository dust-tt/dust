import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameInvocation } from "@app/tests/utils/FrameFunctionFactory";
import { frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("SandboxFunctionResource.fetchInvocationByFrameAndId", () => {
  it("resolves the invocation after the Frame republishes", async () => {
    const { auth, frame, invocation } = await makeTestFrameInvocation();
    await frame.setActiveFramePublication({
      publicationId: "publication-2",
      name: "Task List",
      description: "Track tasks.",
    });

    await expect(
      SandboxFunctionResource.fetchInvocationByFrameAndId(auth, {
        frame,
        invocationId: invocation.sId,
      })
    ).resolves.toMatchObject({ sId: invocation.sId });
  });

  it("rejects an invocation owned by another Frame", async () => {
    const { adminAuth, auth, invocation, space } =
      await makeTestFrameInvocation();
    const otherFrame = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "other-manifest.json",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: space.sId,
        activePublicationId: "publication-1",
      },
    });

    await expect(
      SandboxFunctionResource.fetchInvocationByFrameAndId(auth, {
        frame: otherFrame,
        invocationId: invocation.sId,
      })
    ).resolves.toBeNull();
  });
});
