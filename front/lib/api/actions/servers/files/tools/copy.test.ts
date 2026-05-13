import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { copyHandler } from "@app/lib/api/actions/servers/files/tools/copy";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

function makeExtra(
  auth: Authenticator,
  conversation: ConversationType
): ToolHandlerExtra {
  const agentLoopContext = {
    runContext: { conversation },
  } as unknown as AgentLoopContextType;
  return { auth, agentLoopContext } as unknown as ToolHandlerExtra;
}

async function setupProjectConversation(
  role: "admin" | "user" = "admin"
): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({ role });
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

  return {
    auth: projectAuth,
    conversation,
  };
}

describe("copyHandler", () => {
  it("copies a file from conversation to project mount", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "conversation/report.pdf", dest: "project/report.pdf" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: "Copied `conversation/report.pdf` to `project/report.pdf`.",
      },
    ]);
  });

  it("copies a file from project to conversation mount", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "project/spec.md", dest: "conversation/spec.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
  });

  it("returns Err when the source file does not exist", async () => {
    const { auth, conversation } = await setupProjectConversation();

    // The global file_storage mock returns a fresh bucket on every call, so we override
    // getPrivateUploadBucket itself for this test to hand the handler a bucket whose .exists()
    // returns false on the source lookup.
    const mockBucket = {
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([false]),
        copy: vi.fn().mockResolvedValue(undefined),
      })),
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await copyHandler(
      { source: "conversation/missing.pdf", dest: "project/missing.pdf" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("Source file not found");
  });

  it("returns Err when source and dest resolve to the same GCS path", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "conversation/x.md", dest: "conversation/x.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("same path");
  });

  it("returns Err for an invalid source scope prefix", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "other/foo.md", dest: "project/foo.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
  });

  it("returns Err for a project path in a non-project conversation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await copyHandler(
      { source: "conversation/x.md", dest: "project/x.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("project conversations");
  });
});
