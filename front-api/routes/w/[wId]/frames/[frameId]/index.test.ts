import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupFrame({
  folderName = "Status",
}: {
  folderName?: string;
} = {}) {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(auth, "frames_v2");
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 10,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}${folderName}/${FRAME_MANIFEST_FILE}`,
  });

  return { auth, conversation, frame, workspace };
}

function patchName(
  workspaceSId: string,
  frameId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${workspaceSId}/frames/${frameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/frames/:frameId", () => {
  it("returns 404 for an unknown Frame", async () => {
    const { workspace } = await setupFrame();

    const response = await patchName(workspace.sId, "fil_unknown", {
      name: "Health",
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for a file that is not a Frame v2", async () => {
    const { auth, workspace } = await setupFrame();
    const file = await FileFactory.csv(auth, null, { useCase: "conversation" });

    const response = await patchName(workspace.sId, file.sId, {
      name: "Health",
    });

    expect(response.status).toBe(404);
  });

  it("fails closed when the Frame source has no writable scoped path", async () => {
    const { auth, workspace } = await setupFrame();
    const unmounted = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await patchName(workspace.sId, unmounted.sId, {
      name: "Health",
    });

    expect(response.status).toBe(403);
  });

  it("rejects a blank name", async () => {
    const { frame, workspace } = await setupFrame();

    const response = await patchName(workspace.sId, frame.sId, { name: "   " });

    expect(response.status).toBe(400);
  });

  it("rejects a name carrying a path separator", async () => {
    const { frame, workspace } = await setupFrame();

    const response = await patchName(workspace.sId, frame.sId, {
      name: "nested/Health",
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing name", async () => {
    const { frame, workspace } = await setupFrame();

    const response = await patchName(workspace.sId, frame.sId, {});

    expect(response.status).toBe(400);
  });
});
