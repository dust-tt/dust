import {
  appendFilePathsHintToQuery,
  copyConversationFilesIntoSub,
  resolveFilePathsInParentScope,
} from "@app/lib/api/actions/servers/run_agent/file_paths";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

async function setupProjectConversation(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
  projectId: string;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const user = auth.getNonNullableUser();

  const space = await SpaceFactory.project(workspace, user.id);
  const addRes = await space.addMembers(auth, { userIds: [user.sId] });
  assert(addRes.isOk(), "Failed to add user to project space");

  const projectAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const conversation = await createConversation(projectAuth, {
    title: "Test",
    visibility: "unlisted",
    spaceId: space.id,
  });

  return { auth: projectAuth, conversation, projectId: space.sId };
}

async function setupPlainConversation(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
}> {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const conversation = await createConversation(auth, {
    title: "Test",
    visibility: "unlisted",
    spaceId: null,
  });
  return { auth, conversation };
}

describe("resolveFilePathsInParentScope", () => {
  it("resolves a conversation-scoped path in a plain conversation", async () => {
    const { auth, conversation } = await setupPlainConversation();

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      "conversation/foo.md",
    ]);

    assert(res.isOk());
    expect(res.value).toHaveLength(1);
    expect(res.value[0].useCase).toBe("conversation");
    expect(res.value[0].rel).toBe("foo.md");
    expect(res.value[0].scopedPath).toBe("conversation/foo.md");
  });

  it("resolves both conversation and Pod paths in a Pod conversation", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      "conversation/a.txt",
      "pod/b.txt",
    ]);

    assert(res.isOk());
    expect(res.value).toHaveLength(2);
    expect(res.value[0].useCase).toBe("conversation");
    expect(res.value[1].useCase).toBe("pod");
    expect(res.value[1].rel).toBe("b.txt");
  });

  it("returns Err for a path with no scope prefix", async () => {
    const { auth, conversation } = await setupPlainConversation();

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      "other/foo.md",
    ]);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("must start with");
    }
  });

  it("returns Err for a Pod path in a non-Pod conversation", async () => {
    const { auth, conversation } = await setupPlainConversation();

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      "pod/spec.md",
    ]);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("Pod conversations");
    }
  });

  it("returns Err when the source file is missing", async () => {
    const { auth, conversation } = await setupPlainConversation();

    // The global mock's `getMetadata` resolves successfully; override here so the file lookup
    // fails and surfaces the missing-file error path.
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        getMetadata: vi.fn().mockRejectedValue(new Error("404")),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      "conversation/missing.md",
    ]);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("File not found");
    }
  });
});

describe("appendFilePathsHintToQuery", () => {
  it("returns the query unchanged when no paths are resolved", () => {
    expect(appendFilePathsHintToQuery("hello", [])).toBe("hello");
  });

  it("appends a one-line nudge when at least one path is resolved", () => {
    const result = appendFilePathsHintToQuery("hello", [
      {
        scopedPath: "conversation/a.md",
        useCase: "conversation",
        rel: "a.md",
      },
    ]);

    expect(result).toBe(
      "hello\n\nSome files have been made available to you through the `files` MCP server."
    );
  });
});

describe("copyConversationFilesIntoSub", () => {
  it("is a no-op when no paths are conversation-scoped", async () => {
    const { auth, conversation } = await setupPlainConversation();

    const res = await copyConversationFilesIntoSub(auth, {
      parentConversation: conversation,
      subConversationId: "sub_sid",
      resolvedFilePaths: [
        {
          scopedPath: "pod/spec.md",
          useCase: "pod",
          rel: "spec.md",
        },
      ],
    });

    assert(res.isOk());
  });

  it("dispatches conversation-scoped paths through the GCS mount copy primitive", async () => {
    const { auth, conversation } = await setupPlainConversation();

    const res = await copyConversationFilesIntoSub(auth, {
      parentConversation: conversation,
      subConversationId: "sub_sid",
      resolvedFilePaths: [
        {
          scopedPath: "conversation/a.md",
          useCase: "conversation",
          rel: "a.md",
        },
        {
          scopedPath: "pod/skipped.md",
          useCase: "pod",
          rel: "skipped.md",
        },
      ],
    });

    assert(res.isOk());
  });

  it("returns Err when the parent auth check fails on a path", async () => {
    const { auth, conversation } = await setupPlainConversation();

    // Force `resolveFile` to fail by making the source object look missing.
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        getMetadata: vi.fn().mockRejectedValue(new Error("404")),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const res = await copyConversationFilesIntoSub(auth, {
      parentConversation: conversation,
      subConversationId: "sub_sid",
      resolvedFilePaths: [
        {
          scopedPath: "conversation/missing.md",
          useCase: "conversation",
          rel: "missing.md",
        },
      ],
    });

    expect(res.isErr()).toBe(true);
  });
});
