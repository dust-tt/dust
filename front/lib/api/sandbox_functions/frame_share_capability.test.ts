import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import {
  createTestAuthorFrameWithDraft,
  createTestFramePublicationFunctions,
  makeTestFrameFunction,
} from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it, vi } from "vitest";

async function setupAuthorFrameWithDraft() {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const { frame } = await createTestAuthorFrameWithDraft(auth);
  return { auth, frame };
}

describe("resolveActiveFrameFunctionForUse", () => {
  it("resolves a function from the active publication", async () => {
    const { auth, frame, sandboxFunction } = await makeTestFrameFunction();

    await expect(
      resolveActiveFrameFunctionForUse(auth, {
        frameId: frame.sId,
        functionName: "run-function",
        target: "live",
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
        description: "Track tasks.",
      });
      return fetchFunction(...args);
    });

    await expect(
      resolveActiveFrameFunctionForUse(auth, {
        frameId: frame.sId,
        functionName: "run-function",
        target: "live",
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
        target: "live",
      })
    ).resolves.toBeNull();
  });

  it("resolves the draft for an editor asking for the latest publication", async () => {
    const { auth, frame } = await setupAuthorFrameWithDraft();
    const fn = await resolveActiveFrameFunctionForUse(auth, {
      frameId: frame.sId,
      functionName: "run-function",
      target: "latest",
    });
    expect(fn?.publicationId).toBe("publication-draft");
  });

  it("resolves live when the live publication is asked for", async () => {
    const { auth, frame } = await setupAuthorFrameWithDraft();
    const fn = await resolveActiveFrameFunctionForUse(auth, {
      frameId: frame.sId,
      functionName: "run-function",
      target: "live",
    });
    expect(fn?.publicationId).toBe("publication-live");
  });

  it("serves live to a caller who cannot write the Frame when asked for latest", async () => {
    const { adminAuth, auth, frame, sandboxFunction } =
      await makeTestFrameFunction();
    await createTestFramePublicationFunctions(adminAuth, {
      frame,
      publicationId: "publication-draft",
      slug: "run-function",
    });
    await frame.setLatestFramePublication({
      publicationId: "publication-draft",
    });

    const fn = await resolveActiveFrameFunctionForUse(auth, {
      frameId: frame.sId,
      functionName: "run-function",
      target: "latest",
    });
    expect(fn?.publicationId).toBe(sandboxFunction.publicationId);
  });
});
