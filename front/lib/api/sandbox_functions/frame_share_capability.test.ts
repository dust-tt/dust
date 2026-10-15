import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import {
  createTestFramePublicationFunctions,
  makeTestFrameFunction,
} from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { describe, expect, it, vi } from "vitest";

async function setupAuthorFrameWithDraft() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(auth, "frames_v2");
  await FeatureFlagFactory.basic(auth, "frames_v2_functions");
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 10,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: {
      conversationId: conversation.sId,
      activePublicationId: "publication-live",
    },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Draft App/${FRAME_MANIFEST_FILE}`,
  });
  await frame.setShareScope(auth, "workspace_and_emails");
  for (const publicationId of ["publication-live", "publication-draft"]) {
    await createTestFramePublicationFunctions(auth, {
      frame,
      publicationId,
      slug: "run-function",
    });
  }
  await frame.setDraftFramePublication({ publicationId: "publication-draft" });
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

  it("refuses the latest publication to a caller who cannot write the Frame", async () => {
    const { adminAuth, auth, frame } = await makeTestFrameFunction();
    await createTestFramePublicationFunctions(adminAuth, {
      frame,
      publicationId: "publication-draft",
      slug: "run-function",
    });
    await frame.setDraftFramePublication({
      publicationId: "publication-draft",
    });

    await expect(
      resolveActiveFrameFunctionForUse(auth, {
        frameId: frame.sId,
        functionName: "run-function",
        target: "latest",
      })
    ).resolves.toBeNull();
  });
});
