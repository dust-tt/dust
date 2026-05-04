import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createConversation } from "@app/lib/api/assistant/conversation";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFileFromConversationAttachment,
  resolveConversationFileRef,
} from "./file_utils";

const { mockResolveConversationFile } = vi.hoisted(() => ({
  mockResolveConversationFile: vi.fn(),
}));

vi.mock(
  "@app/lib/api/actions/servers/files/tools/utils",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/actions/servers/files/tools/utils")
      >();
    return {
      ...actual,
      resolveConversationFile: mockResolveConversationFile,
    };
  }
);

function makeAgentLoopContext(
  conversation: ConversationType
): AgentLoopContextType {
  return {
    runContext: { conversation },
  } as unknown as AgentLoopContextType;
}

function makeReadableStream(content: string): Readable {
  return new Readable({
    read() {
      this.push(content);
      this.push(null);
    },
  });
}

describe("getFileFromConversationAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("legacy fileId path", () => {
    it("reads the file content for an attached content fragment", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
        contentType: "application/pdf",
        fileName: "report.pdf",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      await ConversationFactory.createContentFragmentMessage({
        auth,
        workspace,
        conversationId: conversation.id,
        rank: 0,
        fileId: file.id,
        title: "Report",
        contentType: "application/pdf",
        fileName: "report.pdf",
      });

      const conversationResult = await getConversation(auth, conversation.sId);
      if (conversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const fullConversation = conversationResult.value;

      const expectedContent = "pdf bytes";
      vi.spyOn(FileResource.prototype, "getReadStream").mockReturnValue(
        makeReadableStream(expectedContent)
      );

      const result = await getFileFromConversationAttachment(
        auth,
        file.sId,
        makeAgentLoopContext(fullConversation)
      );

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.buffer.toString()).toBe(expectedContent);
      expect(result.value.contentType).toBe("application/pdf");
      // title is overridden by fileResource.fileName during conversation rendering
      expect(result.value.filename).toBe("report.pdf");
    });

    it("returns Err when the fileId is not in the conversation", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const conversationResult = await getConversation(auth, conversation.sId);
      if (conversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }

      const result = await getFileFromConversationAttachment(
        auth,
        "fil_notfound",
        makeAgentLoopContext(conversationResult.value)
      );

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error).toContain("not found in conversation");
    });
  });

  describe("scoped path (conversation/...)", () => {
    it("reads the file content from GCS via resolveConversationFile", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const expectedContent = "gcs bytes";
      mockResolveConversationFile.mockResolvedValue(
        new Ok({
          file: { createReadStream: () => makeReadableStream(expectedContent) },
          mimeType: "text/plain",
          sizeBytes: 9,
        })
      );

      const result = await getFileFromConversationAttachment(
        auth,
        "conversation/notes.txt",
        makeAgentLoopContext({ ...conversation, content: [] })
      );

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.buffer.toString()).toBe(expectedContent);
      expect(result.value.contentType).toBe("text/plain");
      expect(result.value.filename).toBe("notes.txt");
    });

    it("returns Err when resolveConversationFile fails", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      mockResolveConversationFile.mockResolvedValue(
        new Err({ message: "GCS object not found" })
      );

      const result = await getFileFromConversationAttachment(
        auth,
        "conversation/missing.pdf",
        makeAgentLoopContext({ ...conversation, content: [] })
      );

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error).toContain("GCS object not found");
    });
  });
});

describe("resolveConversationFileRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Err when agentLoopContext has no runContext", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const result = await resolveConversationFileRef(
      auth,
      "conversation/file.pdf",
      undefined
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error).toContain("No conversation context");
  });

  it("returns the signed URL and metadata for a legacy fileId", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "image/png",
      fileName: "photo.png",
      fileSize: 512,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const result = await resolveConversationFileRef(
      auth,
      file.sId,
      makeAgentLoopContext({ ...conversation, content: [] })
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.contentType).toBe("image/png");
    expect(result.value.fileName).toBe("photo.png");
    expect(result.value.sizeBytes).toBe(512);
    expect(typeof result.value.getSignedUrl).toBe("function");
    expect(typeof result.value.createReadStream).toBe("function");
  });

  it("returns Err when the legacy file does not belong to the conversation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversationA = await createConversation(auth, {
      title: "A",
      visibility: "unlisted",
      spaceId: null,
    });

    const conversationB = await createConversation(auth, {
      title: "B",
      visibility: "unlisted",
      spaceId: null,
    });

    // File belongs to conversation A.
    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "image/png",
      fileName: "photo.png",
      fileSize: 512,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversationA.sId },
    });

    // But agentLoopContext points to conversation B.
    const result = await resolveConversationFileRef(
      auth,
      file.sId,
      makeAgentLoopContext({ ...conversationB, content: [] })
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error).toContain("does not belong to this conversation");
  });
});
