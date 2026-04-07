import { removeFileFromProject } from "@app/lib/api/projects/context";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("removeFileFromProject", () => {
  beforeEach(() => {
    // keep tests isolated; factories already run in their own DB context
  });

  it("deletes the file and deletes orphaned project content fragments", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    const file = await ProjectFileFactory.create(auth, user, project, {
      contentType: "text/plain",
      fileName: "proj.txt",
      fileSize: 123,
      status: "ready",
    });

    const frBefore = await ContentFragmentModel.findOne({
      where: {
        workspaceId: workspace.id,
        spaceId: project.id,
        fileId: file.id,
      },
    });
    expect(frBefore).toBeTruthy();

    const res = await removeFileFromProject(auth, {
      space: project,
      fileId: file.sId,
    });
    expect(res.isOk()).toBe(true);

    const fileAfter = await FileModel.findOne({
      where: { workspaceId: workspace.id, id: file.id },
    });
    expect(fileAfter).toBeNull();

    const frAfter = await ContentFragmentModel.findOne({
      where: { id: frBefore!.id, workspaceId: workspace.id },
    });
    expect(frAfter).toBeNull();
  });

  it("marks referenced project fragments as expired and clears spaceId", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    const file = await ProjectFileFactory.create(auth, user, project, {
      contentType: "text/plain",
      fileName: "referenced.txt",
      fileSize: 321,
      status: "ready",
    });

    const fr = await ContentFragmentModel.findOne({
      where: {
        workspaceId: workspace.id,
        spaceId: project.id,
        fileId: file.id,
      },
    });
    expect(fr).toBeTruthy();

    // Create a conversation + message referencing this project fragment.
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });

    await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 999,
      conversationId: conversation.id,
      parentId: null,
      contentFragmentId: fr!.id,
      workspaceId: workspace.id,
    });

    const res = await removeFileFromProject(auth, {
      space: project,
      fileId: file.sId,
    });
    expect(res.isOk()).toBe(true);

    const fileAfter = await FileModel.findOne({
      where: { workspaceId: workspace.id, id: file.id },
    });
    expect(fileAfter).toBeNull();

    const frAfter = await ContentFragmentModel.findOne({
      where: { id: fr!.id, workspaceId: workspace.id },
    });
    expect(frAfter).toBeTruthy();
    expect(frAfter!.spaceId).toBeNull();
    expect(frAfter!.expiredReason).toBe("file_deleted");
  });
});
