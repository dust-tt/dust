import { computeFrameContentHash } from "@app/lib/api/viz/authorized_file_access_policy";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { AuthorizedFileRef } from "@app/types/files";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FRAME_CONTENT =
  'export default function Frame() { useFile("fil_DATA000001"); }';

const refs: AuthorizedFileRef[] = [
  { kind: "file_id", ref: "fil_DATA000001" },
  {
    kind: "canonical_path",
    ref: "pod-p_other/data.csv",
    legacyPath: "project/data.csv",
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockStoredContent(content: string) {
  vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
    Readable.from([Buffer.from(content, "utf-8")])
  );
}

describe("GET /api/w/:wId/frames/:frameId/authorized-files", () => {
  it("returns the allowlist persisted for the Frame's current content", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: FRAME_CONTENT.length,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    await frame.persistAuthorizedFileAccess({
      generatedByUserId: user.id,
      frameContentHash: computeFrameContentHash(FRAME_CONTENT),
      refs,
    });
    mockStoredContent(FRAME_CONTENT);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/authorized-files`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ refs });
  });

  it("returns no refs when the allowlist is stale against the Frame's content", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: FRAME_CONTENT.length,
      status: "ready",
      useCase: "conversation",
    });
    await frame.persistAuthorizedFileAccess({
      generatedByUserId: user.id,
      frameContentHash: computeFrameContentHash("export default () => null;"),
      refs,
    });
    mockStoredContent(FRAME_CONTENT);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/authorized-files`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ refs: [] });
  });

  it("returns no refs for a Frame that was never allowlisted", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: FRAME_CONTENT.length,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/authorized-files`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ refs: [] });
  });

  it("hides a Frame in a space the caller cannot read", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: FRAME_CONTENT.length,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: restrictedSpace.sId },
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/authorized-files`
    );

    expect(response.status).toBe(404);
  });

  it("rejects a file that is not a Frame", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const file = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${file.sId}/authorized-files`
    );

    expect(response.status).toBe(404);
  });
});
