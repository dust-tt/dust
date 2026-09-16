import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import { generateSnippet } from "@app/lib/api/files/snippet";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE } from "@app/lib/workspace_policies";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/files/snippet"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    generateSnippet: vi.fn(),
  };
});

describe("maybeUpsertFileAttachment", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = {
      sId: "conv-test-sid",
      owner: workspace,
    } as unknown as ConversationType;

    vi.mocked(generateSnippet).mockResolvedValue(new Ok("pasted content"));
  });

  it("stamps conversationId on files without useCaseMetadata", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/csv",
      fileName: "attachment.csv",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      conversationId: conversation.sId,
    });
  });

  it("generates snippets for pasted files", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/vnd.dust.attachment.pasted",
      fileName: "pasted-text-1_2026-06-22_10-00-00.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {},
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);
    expect(generateSnippet).toHaveBeenCalledOnce();
    expect(vi.mocked(generateSnippet).mock.calls[0][1].file.sId).toBe(file.sId);

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      conversationId: conversation.sId,
    });
    expect(reloaded?.snippet).toBe("pasted content");
  });

  it("generates missing snippets for pasted files already attached to a conversation", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/vnd.dust.attachment.pasted",
      fileName: "pasted-text-2_2026-06-22_10-00-00.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
      snippet: null,
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);
    expect(generateSnippet).toHaveBeenCalledOnce();
    expect(vi.mocked(generateSnippet).mock.calls[0][1].file.sId).toBe(file.sId);

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      conversationId: conversation.sId,
    });
    expect(reloaded?.snippet).toBe("pasted content");
  });

  it("refuses audio attachments when voice transcription is disabled", async () => {
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowVoiceTranscription: false,
    });
    const disabledAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const file = await FileFactory.create(disabledAuth, null, {
      contentType: "audio/mpeg",
      fileName: "meeting.mp3",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    const result = await maybeUpsertFileAttachment(disabledAuth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toBe(
      AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE
    );

    // The file is left untouched: no mount path is resolved for a missing transcript.
    const reloaded = await FileResource.fetchById(disabledAuth, file.sId);
    expect(reloaded?.useCaseMetadata?.conversationId).toBeUndefined();
  });

  it("stamps conversationId on audio attachments when transcription is available", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "audio/mpeg",
      fileName: "meeting.mp3",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);
  });

  it("does not rewrite useCaseMetadata when conversationId is already set", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "attachment.txt",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "pre-existing-conv" },
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      conversationId: "pre-existing-conv",
    });
  });
});
