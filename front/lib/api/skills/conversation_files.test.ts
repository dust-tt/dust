import { upsertSkillFilesToConversation } from "@app/lib/api/skills/conversation_files";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SKILL_ICON } from "@app/lib/skill";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { conversationScopedPath } from "@app/types/file_system";
import assert from "assert";
import { describe, expect, it } from "vitest";

// Mirrors `GCSFileSystemBackend.toGCSPath` for a conversation-scoped path (front/lib/api/file_system/backends/gcs_file_system_backend.ts).
function gcsPathForSkillFile({
  workspaceId,
  conversationId,
  skillName,
  fileName,
}: {
  workspaceId: string;
  conversationId: string;
  skillName: string;
  fileName: string;
}): string {
  return `w/${workspaceId}/conversations/${conversationId}/files/skills/${skillName}/${fileName}`;
}

async function setupConversationAndSkillPermissions() {
  const {
    authenticator: auth,
    user,
    workspace,
  } = await createResourceTest({ role: "user" });

  if (!(await auth.hasWorkspacePermission("create", "skill"))) {
    await grantWorkspacePermission(workspace, user, {
      grantType: "create",
      resourceType: "skill",
    });
    await auth.refresh();
  }

  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });

  return { auth, user, workspace, conversation };
}

async function createSkillFileAttachment(
  auth: Authenticator,
  user: Parameters<typeof FileFactory.create>[1],
  { fileName, content }: { fileName: string; content: string }
) {
  const file = await FileFactory.create(auth, user, {
    contentType: "text/plain",
    fileName,
    fileSize: content.length,
    status: "ready",
    useCase: "skill_attachment",
  });

  return { file, content };
}

describe("upsertSkillFilesToConversation", () => {
  it("writes every missing skill file and returns their scoped paths", async () => {
    const { auth, user, workspace, conversation } =
      await setupConversationAndSkillPermissions();

    const attachments = await Promise.all(
      [
        { fileName: "a.txt", content: "content-a" },
        { fileName: "b.txt", content: "content-b" },
      ].map((spec) => createSkillFileAttachment(auth, user, spec))
    );

    const contentBySourcePath = new Map(
      attachments.map(({ file, content }) => [
        file.getCloudStoragePath(auth, "original"),
        content,
      ])
    );
    fileStorageMock.setFileExists(() => false);
    fileStorageMock.setFileContent(
      (filePath) => contentBySourcePath.get(filePath) ?? null
    );

    const skill = await SkillResource.makeNew(
      auth,
      {
        editedBy: user.id,
        agentFacingDescription: "desc",
        userFacingDescription: "desc",
        instructions: "instructions",
        instructionsHtml: null,
        name: "Test Skill",
        requestedSpaceIds: [],
        status: "active",
        icon: SKILL_ICON.name,
        availability: "editors",
      },
      {
        mcpServerViews: [],
        fileAttachments: attachments.map(({ file }) => file),
      }
    );

    const result = await upsertSkillFilesToConversation(auth, {
      skill,
      conversation,
    });

    assert(result.isOk());
    expect(result.value.loadedPaths.sort()).toEqual(
      [
        conversationScopedPath({
          conversationId: conversation.sId,
          rel: `skills/${skill.name}/a.txt`,
        }),
        conversationScopedPath({
          conversationId: conversation.sId,
          rel: `skills/${skill.name}/b.txt`,
        }),
      ].sort()
    );

    for (const { file } of attachments) {
      const gcsPath = gcsPathForSkillFile({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        skillName: skill.name,
        fileName: file.fileName,
      });
      expect(
        fileStorageMock.writeStreamCalls.some(
          (call) => call.filePath === gcsPath
        )
      ).toBe(true);
    }
  });

  it("skips files already present and never re-reads their content", async () => {
    const { auth, user, conversation } =
      await setupConversationAndSkillPermissions();

    const { file } = await createSkillFileAttachment(auth, user, {
      fileName: "already-there.txt",
      content: "irrelevant",
    });
    fileStorageMock.setFileExists(() => true);

    const skill = await SkillResource.makeNew(
      auth,
      {
        editedBy: user.id,
        agentFacingDescription: "desc",
        userFacingDescription: "desc",
        instructions: "instructions",
        instructionsHtml: null,
        name: "Test Skill",
        requestedSpaceIds: [],
        status: "active",
        icon: SKILL_ICON.name,
        availability: "editors",
      },
      { mcpServerViews: [], fileAttachments: [file] }
    );

    const result = await upsertSkillFilesToConversation(auth, {
      skill,
      conversation,
    });

    assert(result.isOk());
    expect(result.value.loadedPaths).toEqual([
      conversationScopedPath({
        conversationId: conversation.sId,
        rel: `skills/${skill.name}/already-there.txt`,
      }),
    ]);
    expect(fileStorageMock.writeStreamCalls).toHaveLength(0);
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
  });

  it("cleans up files written by this call when a later write fails, leaving pre-existing files untouched", async () => {
    const { auth, user, workspace, conversation } =
      await setupConversationAndSkillPermissions();

    const specs = [
      { fileName: "pre-existing.txt", content: "already-mounted" },
      { fileName: "will-succeed.txt", content: "content-b" },
      { fileName: "will-fail.txt", content: "content-c" },
    ];
    const attachments = await Promise.all(
      specs.map((spec) => createSkillFileAttachment(auth, user, spec))
    );
    const [preExisting, willSucceed, willFail] = attachments;

    const contentBySourcePath = new Map(
      attachments.map(({ file, content }) => [
        file.getCloudStoragePath(auth, "original"),
        content,
      ])
    );
    fileStorageMock.setFileContent(
      (filePath) => contentBySourcePath.get(filePath) ?? null
    );

    const skill = await SkillResource.makeNew(
      auth,
      {
        editedBy: user.id,
        agentFacingDescription: "desc",
        userFacingDescription: "desc",
        instructions: "instructions",
        instructionsHtml: null,
        name: "Test Skill",
        requestedSpaceIds: [],
        status: "active",
        icon: SKILL_ICON.name,
        availability: "editors",
      },
      {
        mcpServerViews: [],
        fileAttachments: attachments.map(({ file }) => file),
      }
    );

    const gcsPathFor = (fileName: string) =>
      gcsPathForSkillFile({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        skillName: skill.name,
        fileName,
      });
    const preExistingPath = gcsPathFor(preExisting.file.fileName);
    const willSucceedPath = gcsPathFor(willSucceed.file.fileName);
    const willFailPath = gcsPathFor(willFail.file.fileName);

    const existsCallCounts = new Map<string, number>();
    fileStorageMock.setFileExists((filePath) => {
      existsCallCounts.set(filePath, (existsCallCounts.get(filePath) ?? 0) + 1);
      return filePath === preExistingPath;
    });
    fileStorageMock.setFileSaveFails((filePath) => filePath === willFailPath);

    const result = await upsertSkillFilesToConversation(auth, {
      skill,
      conversation,
    });

    assert(result.isErr());
    expect(result.error.message).toContain(willFail.file.fileName);

    // Pre-existing file: only the pass-1 existence check, never written or cleaned up.
    expect(existsCallCounts.get(preExistingPath)).toBe(1);
    // Written-then-failed sibling: pass-1 check plus the cleanup delete's own existence check.
    expect(existsCallCounts.get(willSucceedPath)).toBe(2);
    // The file whose own write failed is never a cleanup target for itself.
    expect(existsCallCounts.get(willFailPath)).toBe(1);

    expect(
      fileStorageMock.writeStreamCalls.some(
        (call) => call.filePath === preExistingPath
      )
    ).toBe(false);
  });
});
