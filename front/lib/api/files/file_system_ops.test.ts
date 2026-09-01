import { DustFileSystem } from "@app/lib/api/file_system";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import { frameContentType } from "@app/types/files";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("enrichListWithFileResourceIds", () => {
  it("keeps the mount-path lookup for GCS files", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({});
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const dustFsRes = await DustFileSystem.forConversation(auth, conversation);
    assert(dustFsRes.isOk());
    expect(dustFsRes.value.isDatabaseBacked()).toBe(false);

    const path = `conversation-${conversation.sId}/Frame.tsx`;
    const mountFilePath =
      `w/${workspace.sId}/conversations/${conversation.sId}` +
      "/files/Frame.tsx";
    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 10,
      mountFilePath,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    const entries: FileSystemEntry[] = [
      {
        isDirectory: false,
        fileName: "Frame.tsx",
        path,
        sizeBytes: 10,
        contentType: "text/typescript",
        lastModifiedMs: Date.now(),
        fileId: null,
        thumbnailUrl: null,
      },
    ];

    const enriched = await enrichListWithFileResourceIds(
      auth,
      dustFsRes.value,
      entries
    );

    expect(enriched[0]).toMatchObject({
      fileId: file.sId,
      contentType: frameContentType,
    });
  });
});
