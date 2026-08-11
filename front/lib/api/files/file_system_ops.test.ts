import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  moveCanonicalFile,
  renameCanonicalFile,
} from "@app/lib/api/files/file_system_ops";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameContentType } from "@app/types/files";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

describe("moveCanonicalFile / renameCanonicalFile FileResource sync", () => {
  let auth: Authenticator;
  let conversation: ConversationType;
  let projectSpace: SpaceResource;
  let workspaceId: string;

  beforeEach(async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });
    workspaceId = workspace.sId;

    // Create the project space, then re-fetch auth so it knows about the new editor group.
    projectSpace = await SpaceFactory.project(workspace, user.id);
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
  });

  async function makeFileSystemWithPodMount(): Promise<DustFileSystem> {
    const fsResult = await DustFileSystem.forAgentLoop(auth, {
      conversation,
      scopedPaths: [`pod-${projectSpace.sId}/app.tsx`],
    });
    assert(fsResult.isOk());
    return fsResult.value;
  }

  async function makePublishedFrame(): Promise<FileResource> {
    const file = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "app.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    // Mirror what publishFrame stores: the entry's directory as bundle root, its
    // filename as entry rel path (see splitFrameEntryScopedPath).
    await file.setUseCaseMetadata(auth, {
      ...(file.useCaseMetadata ?? {}),
      frameBundleRootPath: `conversation-${conversation.sId}`,
      frameEntryRelPath: "app.tsx",
      lastEditedByAgentConfigurationId: "test_agent_config_id",
    });

    expect(file.mountFilePath).toBe(
      `w/${workspaceId}/conversations/${conversation.sId}/files/app.tsx`
    );
    expect(file.isPublishedFrame()).toBe(true);

    return file;
  }

  it("keeps a published frame published when moved from conversation to pod", async () => {
    const file = await makePublishedFrame();
    const dustFs = await makeFileSystemWithPodMount();

    // The destination must not pre-exist for DustFileSystem.move to proceed.
    fileStorageMock.setFileExists(
      (filePath) => !filePath.startsWith(`w/${workspaceId}/pods/`)
    );

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `conversation-${conversation.sId}/app.tsx`,
      `pod-${projectSpace.sId}/app.tsx`
    );
    assert(result.isOk());

    const moved = await FileResource.fetchById(auth, file.sId);
    assert(moved);

    expect(moved.mountFilePath).toBe(
      `w/${workspaceId}/pods/${projectSpace.sId}/files/app.tsx`
    );
    expect(moved.useCase).toBe("project_context");
    expect(moved.useCaseMetadata?.spaceId).toBe(projectSpace.sId);
    expect(moved.useCaseMetadata?.conversationId).toBeUndefined();

    // The publish state must survive the move, retargeted to the new location.
    expect(moved.useCaseMetadata?.frameBundleRootPath).toBe(
      `pod-${projectSpace.sId}`
    );
    expect(moved.useCaseMetadata?.frameEntryRelPath).toBe("app.tsx");
    expect(moved.useCaseMetadata?.lastEditedByAgentConfigurationId).toBe(
      "test_agent_config_id"
    );
    expect(moved.isPublishedFrame()).toBe(true);
    expect(moved.getRenderableVersion()).toBe("processed");
  });

  it("keeps a published frame published when renamed in place", async () => {
    const file = await makePublishedFrame();
    const dustFs = await makeFileSystemWithPodMount();

    fileStorageMock.setFileExists(
      (filePath) => !filePath.endsWith("/main.tsx")
    );

    const result = await renameCanonicalFile(
      auth,
      dustFs,
      `conversation-${conversation.sId}/app.tsx`,
      "main.tsx"
    );
    assert(result.isOk());

    const renamed = await FileResource.fetchById(auth, file.sId);
    assert(renamed);

    expect(renamed.mountFilePath).toBe(
      `w/${workspaceId}/conversations/${conversation.sId}/files/main.tsx`
    );
    expect(renamed.useCase).toBe("tool_output");
    expect(renamed.useCaseMetadata?.conversationId).toBe(conversation.sId);
    expect(renamed.useCaseMetadata?.frameBundleRootPath).toBe(
      `conversation-${conversation.sId}`
    );
    expect(renamed.useCaseMetadata?.frameEntryRelPath).toBe("main.tsx");
    expect(renamed.isPublishedFrame()).toBe(true);
    expect(renamed.getRenderableVersion()).toBe("processed");
  });

  it("swaps scope metadata and preserves the rest for non-frame files", async () => {
    const file = await FileFactory.csv(auth, null, {
      useCase: "tool_output",
      useCaseMetadata: {
        conversationId: conversation.sId,
        generatedTables: ["table_1"],
      },
      fileName: "data.csv",
    });
    const dustFs = await makeFileSystemWithPodMount();

    fileStorageMock.setFileExists(
      (filePath) => !filePath.startsWith(`w/${workspaceId}/pods/`)
    );

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `conversation-${conversation.sId}/data.csv`,
      `pod-${projectSpace.sId}/data.csv`
    );
    assert(result.isOk());

    const moved = await FileResource.fetchById(auth, file.sId);
    assert(moved);

    expect(moved.useCase).toBe("project_context");
    expect(moved.useCaseMetadata?.spaceId).toBe(projectSpace.sId);
    expect(moved.useCaseMetadata?.conversationId).toBeUndefined();
    expect(moved.useCaseMetadata?.generatedTables).toEqual(["table_1"]);
    expect(moved.useCaseMetadata?.frameBundleRootPath).toBeUndefined();
  });
});
