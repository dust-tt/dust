import type {
  SandboxFunctionRunContext,
  ToolContext,
  ToolRunContext,
} from "@app/lib/actions/types";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { FileResource } from "@app/lib/resources/file_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { makeExtra } from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFileFromToolFileRef, resolveToolFileRef } from "./file_utils";

const { mockResolveFile, mockForPod, mockFromScopedPath } = vi.hoisted(() => ({
  mockResolveFile: vi.fn(),
  mockForPod: vi.fn(),
  mockFromScopedPath: vi.fn(),
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
      resolveFile: mockResolveFile,
    };
  }
);

vi.mock("@app/lib/api/file_system", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/file_system")>();
  return {
    ...actual,
    DustFileSystem: {
      ...actual.DustFileSystem,
      forPod: mockForPod,
      fromScopedPath: mockFromScopedPath,
    },
  };
});

function makeToolContext(conversation: ConversationType): ToolContext {
  return {
    runContext: { contextType: "agent_loop", conversation },
  } as unknown as ToolContext;
}

function getRunContext(toolContext: ToolContext): ToolRunContext {
  if (!toolContext.runContext) {
    throw new Error("Tool run context expected");
  }
  return toolContext.runContext;
}

function makeReadableStream(content: string): Readable {
  return new Readable({
    read() {
      this.push(content);
      this.push(null);
    },
  });
}

async function makeSandboxRunContext(): Promise<{
  auth: Awaited<
    ReturnType<typeof createPersistedSandboxFunctionInvocationTokenTestContext>
  >["auth"];
  podId: string;
  runContext: SandboxFunctionRunContext;
}> {
  const { auth, workspace, invocation, globalSpace, podSpace } =
    await createPersistedSandboxFunctionInvocationTokenTestContext();
  const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name: "common_utilities",
    useCase: null,
  });
  const view = await MCPServerViewFactory.create(
    workspace,
    server.id,
    globalSpace
  );
  const action = await SandboxFunctionMCPActionFactory.create(auth, {
    invocation,
    mcpServerView: view,
  });

  return {
    auth,
    podId: podSpace.sId,
    runContext: {
      contextType: "sandbox_function",
      action,
      invocation,
      toolConfiguration: action.toolConfiguration,
    },
  };
}

describe("getFileFromToolFileRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canonical scoped path (conversation-{id}/...)", () => {
    it("reads the file content via DustFileSystem", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const canonicalPath = `conversation-${conversation.sId}/report.csv`;
      const expectedContent = "col1,col2\nval1,val2";

      mockFromScopedPath.mockResolvedValue(
        new Ok({
          stat: vi
            .fn()
            .mockResolvedValue(
              new Ok({ contentType: "text/csv", sizeBytes: 19 })
            ),
          read: vi
            .fn()
            .mockResolvedValue(new Ok(makeReadableStream(expectedContent))),
        })
      );

      const result = await getFileFromToolFileRef(
        auth,
        canonicalPath,
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.buffer.toString()).toBe(expectedContent);
      expect(result.value.contentType).toBe("text/csv");
      expect(result.value.filename).toBe("report.csv");
    });

    it("returns Err when the file is not found", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      mockFromScopedPath.mockResolvedValue(
        new Ok({
          stat: vi.fn().mockResolvedValue(new Ok(null)),
          read: vi.fn(),
        })
      );

      const result = await getFileFromToolFileRef(
        auth,
        `conversation-${conversation.sId}/missing.pdf`,
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error).toContain("not found");
    });

    it("returns Err when fromScopedPath fails", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      mockFromScopedPath.mockResolvedValue(
        new Err({ message: "Conversation not found" })
      );

      const result = await getFileFromToolFileRef(
        auth,
        `conversation-${conversation.sId}/file.txt`,
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isErr()).toBe(true);
    });
  });

  describe("sandbox function path", () => {
    it("reads an absolute path from the invoking function's pod", async () => {
      const { auth, podId, runContext } = await makeSandboxRunContext();
      const expectedContent = "col1,col2\nval1,val2";
      const stat = vi
        .fn()
        .mockResolvedValue(new Ok({ contentType: "text/csv", sizeBytes: 19 }));
      const read = vi
        .fn()
        .mockResolvedValue(new Ok(makeReadableStream(expectedContent)));

      mockForPod.mockResolvedValue(new Ok({ stat, read }));

      const result = await getFileFromToolFileRef(
        auth,
        `/files/pod-${podId}/reports/data.csv`,
        runContext
      );

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.buffer.toString()).toBe(expectedContent);
      expect(result.value.filename).toBe("data.csv");
      expect(mockForPod).toHaveBeenCalledWith(
        auth,
        runContext.invocation.sandboxFunction.space
      );
      expect(stat).toHaveBeenCalledWith(`pod-${podId}/reports/data.csv`);
      expect(read).toHaveBeenCalledWith(`pod-${podId}/reports/data.csv`);
      expect(mockFromScopedPath).not.toHaveBeenCalled();
    });
  });

  describe("legacy fileId path", () => {
    it("reads the file content for an attached content fragment", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const conversationResource = await createConversation(auth, {
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
        useCaseMetadata: { conversationId: conversationResource.sId },
      });

      await ConversationFactory.createContentFragmentMessage({
        auth,
        workspace,
        conversationId: conversationResource.id,
        rank: 0,
        fileId: file.id,
        title: "Report",
        contentType: "application/pdf",
        fileName: "report.pdf",
      });

      const conversationRes = await getConversation(
        auth,
        conversationResource.sId
      );
      if (conversationRes.isErr()) {
        throw new Error(
          `Failed to fetch conversation: ${conversationRes.error.type}`
        );
      }

      const expectedContent = "pdf bytes";
      vi.spyOn(FileResource.prototype, "getReadStream").mockReturnValue(
        makeReadableStream(expectedContent)
      );

      const result = await getFileFromToolFileRef(
        auth,
        file.sId,
        getRunContext(makeToolContext(conversationRes.value))
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

      const conversationResource = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const conversationRes = await getConversation(
        auth,
        conversationResource.sId
      );
      if (conversationRes.isErr()) {
        throw new Error(
          `Failed to fetch conversation: ${conversationRes.error.type}`
        );
      }

      const result = await getFileFromToolFileRef(
        auth,
        "fil_notfound",
        getRunContext(makeToolContext(conversationRes.value))
      );

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error).toContain("not found in conversation");
    });
  });

  describe("scoped path (conversation/...)", () => {
    it("reads the file content from GCS via resolveFile", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const expectedContent = "gcs bytes";
      mockResolveFile.mockResolvedValue(
        new Ok({
          file: { createReadStream: () => makeReadableStream(expectedContent) },
          mimeType: "text/plain",
          sizeBytes: 9,
        })
      );

      const result = await getFileFromToolFileRef(
        auth,
        "conversation/notes.txt",
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.buffer.toString()).toBe(expectedContent);
      expect(result.value.contentType).toBe("text/plain");
      expect(result.value.filename).toBe("notes.txt");
    });

    it("returns Err when resolveFile fails", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      mockResolveFile.mockResolvedValue(
        new Err({ message: "GCS object not found" })
      );

      const result = await getFileFromToolFileRef(
        auth,
        "conversation/missing.pdf",
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error).toContain("GCS object not found");
    });
  });
});

describe("resolveToolFileRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canonical scoped path (conversation-{id}/...)", () => {
    it("returns metadata, getSignedUrl, and createReadStream via DustFileSystem", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const canonicalPath = `conversation-${conversation.sId}/photo.png`;
      const signedUrl = "https://storage.example.com/signed";

      mockFromScopedPath.mockResolvedValue(
        new Ok({
          stat: vi
            .fn()
            .mockResolvedValue(
              new Ok({ contentType: "image/png", sizeBytes: 512 })
            ),
          read: vi
            .fn()
            .mockResolvedValue(new Ok(makeReadableStream("img bytes"))),
          getDownloadUrl: vi.fn().mockResolvedValue(new Ok(signedUrl)),
        })
      );

      const result = await resolveToolFileRef(
        auth,
        canonicalPath,
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.contentType).toBe("image/png");
      expect(result.value.sizeBytes).toBe(512);
      expect(result.value.fileName).toBe("photo.png");
      expect(await result.value.getSignedUrl()).toBe(signedUrl);
    });

    it("resolves a canonical path from the agent loop", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      mockFromScopedPath.mockResolvedValue(
        new Ok({
          stat: vi
            .fn()
            .mockResolvedValue(
              new Ok({ contentType: "text/plain", sizeBytes: 10 })
            ),
          read: vi.fn().mockResolvedValue(new Ok(makeReadableStream("hello"))),
          getDownloadUrl: vi
            .fn()
            .mockResolvedValue(new Ok("https://example.com/url")),
        })
      );

      const result = await resolveToolFileRef(
        auth,
        `conversation-${conversation.sId}/file.txt`,
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isOk()).toBe(true);
    });

    it("returns Err when the file is not found", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      mockFromScopedPath.mockResolvedValue(
        new Ok({
          stat: vi.fn().mockResolvedValue(new Ok(null)),
        })
      );

      const result = await resolveToolFileRef(
        auth,
        `conversation-${conversation.sId}/missing.png`,
        getRunContext(makeExtra(auth, conversation))
      );

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error).toContain("not found");
    });
  });

  describe("sandbox function path", () => {
    it("resolves a scoped path from the invoking function's pod", async () => {
      const { auth, podId, runContext } = await makeSandboxRunContext();
      const signedUrl = "https://storage.example.com/signed";
      const stat = vi
        .fn()
        .mockResolvedValue(
          new Ok({ contentType: "image/png", sizeBytes: 512 })
        );
      const getDownloadUrl = vi.fn().mockResolvedValue(new Ok(signedUrl));

      mockForPod.mockResolvedValue(
        new Ok({
          stat,
          getDownloadUrl,
        })
      );

      const scopedPath = `pod-${podId}/images/reference.png`;
      const result = await resolveToolFileRef(auth, scopedPath, runContext);

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.fileName).toBe("reference.png");
      expect(await result.value.getSignedUrl()).toBe(signedUrl);
      expect(mockForPod).toHaveBeenCalledWith(
        auth,
        runContext.invocation.sandboxFunction.space
      );
      expect(stat).toHaveBeenCalledWith(scopedPath);
      expect(getDownloadUrl).toHaveBeenCalledWith(scopedPath);
      expect(mockFromScopedPath).not.toHaveBeenCalled();
    });
  });

  it("returns the signed URL and metadata for a legacy fileId", async () => {
    const { authenticator: auth } = await createResourceTest({
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

    const result = await resolveToolFileRef(
      auth,
      file.sId,
      getRunContext(makeExtra(auth, conversation))
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

    // But toolContext points to conversation B.
    const result = await resolveToolFileRef(
      auth,
      file.sId,
      getRunContext(makeExtra(auth, conversationB))
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error).toContain("does not belong to this conversation");
  });
});
