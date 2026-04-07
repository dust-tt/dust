import {
  removeContentNodeFromProject,
  removeFileFromProject,
} from "@app/lib/api/projects/context";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
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

describe("removeContentNodeFromProject", () => {
  beforeEach(() => {
    // keep tests isolated; factories already run in their own DB context
  });

  it("deletes orphaned project content-node fragments", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    const dsView = await DataSourceViewFactory.folder(
      workspace,
      project,
      auth.user()
    );

    const fr = await ContentFragmentModel.create({
      workspaceId: workspace.id,
      spaceId: project.id,
      fileId: null,
      title: "Node",
      contentType: "text/plain",
      sourceUrl: null,
      textBytes: null,
      userId: auth.getNonNullableUser().id,
      userContextUsername: "u",
      userContextFullName: "U",
      userContextEmail: "u@example.com",
      userContextProfilePictureUrl: null,
      nodeId: "node_1",
      nodeDataSourceViewId: dsView.id,
      nodeType: "document",
      version: "latest",
      expiredReason: null,
      sId: "cf_test_node_1",
    });

    const res = await removeContentNodeFromProject(auth, {
      space: project,
      nodeId: "node_1",
      nodeDataSourceViewId: dsView.sId,
    });
    expect(res.isOk()).toBe(true);

    const frAfter = await ContentFragmentModel.findOne({
      where: { id: fr.id, workspaceId: workspace.id },
    });
    expect(frAfter).toBeNull();
  });

  it("marks referenced fragments as expired and clears spaceId", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    const dsView = await DataSourceViewFactory.folder(
      workspace,
      project,
      auth.user()
    );

    const fr = await ContentFragmentModel.create({
      workspaceId: workspace.id,
      spaceId: project.id,
      fileId: null,
      title: "Node",
      contentType: "text/plain",
      sourceUrl: null,
      textBytes: null,
      userId: auth.getNonNullableUser().id,
      userContextUsername: "u",
      userContextFullName: "U",
      userContextEmail: "u@example.com",
      userContextProfilePictureUrl: null,
      nodeId: "node_2",
      nodeDataSourceViewId: dsView.id,
      nodeType: "document",
      version: "latest",
      expiredReason: null,
      sId: "cf_test_node_2",
    });

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
      contentFragmentId: fr.id,
      workspaceId: workspace.id,
    });

    const res = await removeContentNodeFromProject(auth, {
      space: project,
      nodeId: "node_2",
      nodeDataSourceViewId: dsView.sId,
    });
    expect(res.isOk()).toBe(true);

    const frAfter = await ContentFragmentModel.findOne({
      where: { id: fr.id, workspaceId: workspace.id },
    });
    expect(frAfter).toBeTruthy();
    expect(frAfter!.spaceId).toBeNull();
    expect(frAfter!.expiredReason).toBeNull();
  });

  it("handles both latest and superseded rows (detaches referenced, deletes orphan)", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    const dsView = await DataSourceViewFactory.folder(
      workspace,
      project,
      auth.user()
    );

    const latest = await ContentFragmentModel.create({
      workspaceId: workspace.id,
      spaceId: project.id,
      fileId: null,
      title: "Node",
      contentType: "text/plain",
      sourceUrl: null,
      textBytes: null,
      userId: auth.getNonNullableUser().id,
      userContextUsername: "u",
      userContextFullName: "U",
      userContextEmail: "u@example.com",
      userContextProfilePictureUrl: null,
      nodeId: "node_3",
      nodeDataSourceViewId: dsView.id,
      nodeType: "document",
      version: "latest",
      expiredReason: null,
      sId: "cf_test_node_3_latest",
    });

    const superseded = await ContentFragmentModel.create({
      workspaceId: workspace.id,
      spaceId: project.id,
      fileId: null,
      title: "Node (old)",
      contentType: "text/plain",
      sourceUrl: null,
      textBytes: null,
      userId: auth.getNonNullableUser().id,
      userContextUsername: "u",
      userContextFullName: "U",
      userContextEmail: "u@example.com",
      userContextProfilePictureUrl: null,
      nodeId: "node_3",
      nodeDataSourceViewId: dsView.id,
      nodeType: "document",
      version: "superseded",
      expiredReason: null,
      sId: "cf_test_node_3_superseded",
    });

    // Reference the latest row from a conversation message; superseded stays orphaned.
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
      contentFragmentId: latest.id,
      workspaceId: workspace.id,
    });

    const res = await removeContentNodeFromProject(auth, {
      space: project,
      nodeId: "node_3",
      nodeDataSourceViewId: dsView.sId,
    });
    expect(res.isOk()).toBe(true);

    const latestAfter = await ContentFragmentModel.findOne({
      where: { id: latest.id, workspaceId: workspace.id },
    });
    expect(latestAfter).toBeTruthy();
    expect(latestAfter!.spaceId).toBeNull();
    expect(latestAfter!.expiredReason).toBeNull();

    const supersededAfter = await ContentFragmentModel.findOne({
      where: { id: superseded.id, workspaceId: workspace.id },
    });
    expect(supersededAfter).toBeNull();
  });
});
