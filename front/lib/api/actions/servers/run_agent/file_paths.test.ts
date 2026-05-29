import {
  appendFilePathsHintToQuery,
  copyConversationFilesIntoSub,
  resolveFilePathsInParentScope,
} from "@app/lib/api/actions/servers/run_agent/file_paths";
import { createConversation } from "@app/lib/api/assistant/conversation";
import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
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
    const path = `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/foo.md`;

    const res = await resolveFilePathsInParentScope(auth, conversation, [path]);

    assert(res.isOk());
    expect(res.value).toEqual([path]);
  });

  it("resolves both conversation and Pod paths in a Pod conversation", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/a.txt`,
      `${SCOPED_PREFIX_POD}${projectId}/b.txt`,
    ]);

    assert(res.isOk());
    expect(res.value).toHaveLength(2);
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
      `${SCOPED_PREFIX_POD}somepodid/spec.md`,
    ]);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("File not found");
    }
  });

  it("returns Err when the source file is missing", async () => {
    const { auth, conversation } = await setupPlainConversation();

    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([false]),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const res = await resolveFilePathsInParentScope(auth, conversation, [
      `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/missing.md`,
    ]);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("File not found");
    }
  });
});

describe("appendFilePathsHintToQuery", () => {
  it("returns the query unchanged when no paths are provided", () => {
    expect(appendFilePathsHintToQuery("hello", [])).toBe("hello");
  });

  it("appends a one-line nudge when at least one path is provided", () => {
    const result = appendFilePathsHintToQuery("hello", [
      "conversation-abc123/a.md",
    ]);

    expect(result).toBe(
      "hello\n\nSome files have been made available to you through the `files` MCP server."
    );
  });
});

describe("copyConversationFilesIntoSub", () => {
  it("is a no-op when no paths are conversation-scoped", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const res = await copyConversationFilesIntoSub(auth, {
      parentConversation: conversation,
      subConversationId: "sub_sid",
      filePaths: [`${SCOPED_PREFIX_POD}${projectId}/spec.md`],
    });

    assert(res.isOk());
  });

  it("copies conversation-scoped files into the sub-conversation", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const subConversation = await createConversation(auth, {
      title: "Sub",
      visibility: "unlisted",
      spaceId: null,
    });

    const res = await copyConversationFilesIntoSub(auth, {
      parentConversation: conversation,
      subConversationId: subConversation.sId,
      filePaths: [
        `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/a.md`,
        `${SCOPED_PREFIX_POD}somepod/skipped.md`,
      ],
    });

    assert(res.isOk());
  });

  it("returns Err when the GCS copy fails", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const subConversation = await createConversation(auth, {
      title: "Sub",
      visibility: "unlisted",
      spaceId: null,
    });

    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        copy: vi.fn().mockRejectedValue(new Error("GCS copy failed")),
      })),
      copyFile: vi.fn().mockRejectedValue(new Error("GCS copy failed")),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const res = await copyConversationFilesIntoSub(auth, {
      parentConversation: conversation,
      subConversationId: subConversation.sId,
      filePaths: [
        `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/missing.md`,
      ],
    });

    expect(res.isErr()).toBe(true);
  });
});
