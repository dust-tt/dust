import {
  createConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import * as contentFragmentModule from "@app/lib/api/assistant/conversation/content_fragment";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createConversationFork } from "@app/lib/api/assistant/conversation/forks";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import * as dataSourcesModule from "@app/lib/api/data_sources";
import * as fileUpsertModule from "@app/lib/api/files/upsert";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationForkModel } from "@app/lib/models/agent/conversation_fork";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { launchCompactionWorkflow } from "@app/temporal/agent_loop/client";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { isCompactionMessageType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

async function createUserMessage(
  auth: Authenticator,
  {
    conversation,
    rank,
    content,
    branchId = null,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    content: string;
    branchId?: ModelId | null;
  }
): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const userMessage = await UserMessageModel.create({
    userId: user.id,
    workspaceId: workspace.id,
    content,
    userContextUsername: user.username,
    userContextTimezone: "UTC",
    userContextFullName: user.fullName(),
    userContextEmail: user.email,
    userContextProfilePictureUrl: user.imageUrl,
    userContextOrigin: "web",
    clientSideMCPServerIds: [],
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    branchId,
    parentId: null,
    userMessageId: userMessage.id,
  });
}

async function createAgentMessage(
  auth: Authenticator,
  {
    conversation,
    rank,
    parentId,
    status,
    generatedFileId = null,
    branchId = null,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    parentId: ModelId;
    status: "created" | "succeeded";
    generatedFileId?: ModelId | null;
    branchId?: ModelId | null;
  }
): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();

  const agentMessage = await AgentMessageModel.create({
    workspaceId: workspace.id,
    status,
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    agentConfigurationVersion: 0,
    skipToolsValidation: false,
    completedAt: status === "created" ? null : new Date(),
  });

  const message = await MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    branchId,
    parentId,
    agentMessageId: agentMessage.id,
  });

  if (!generatedFileId) {
    return message;
  }

  const stepContent = await AgentStepContentModel.create({
    workspaceId: workspace.id,
    agentMessageId: agentMessage.id,
    step: 1,
    index: 0,
    version: 0,
    type: "function_call",
    value: {
      type: "function_call",
      value: {
        id: generateRandomModelSId(),
        name: "test_tool",
        arguments: "{}",
      },
    },
  });

  const action = await AgentMCPActionModel.create({
    workspaceId: workspace.id,
    agentMessageId: agentMessage.id,
    stepContentId: stepContent.id,
    mcpServerConfigurationId: generateRandomModelSId(),
    version: 0,
    status: "succeeded",
    citationsAllocated: 0,
    augmentedInputs: {},
    toolConfiguration: {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "test_tool",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "test_tool",
      mcpServerName: "test_server",
    },
    stepContext: {
      citationsCount: 0,
      citationsOffset: 0,
      resumeState: null,
      retrievalTopK: 10,
      websearchResultCount: 0,
    },
  });

  await AgentMCPActionOutputItemModel.create({
    workspaceId: workspace.id,
    agentMCPActionId: action.id,
    content: { type: "text", text: "Tool output" },
    contentGcsPath: null,
    fileId: generatedFileId,
    citations: null,
  });

  return message;
}

async function createConversationFile(
  auth: Authenticator,
  {
    conversationId,
    fileName,
    snippet = null,
  }: {
    conversationId: string;
    fileName: string;
    snippet?: string | null;
  }
): Promise<FileResource> {
  return FileFactory.create(auth, auth.getNonNullableUser(), {
    contentType: "text/plain",
    fileName,
    fileSize: 16,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: {
      conversationId,
    },
    snippet,
  });
}

async function createToolOutputFile(
  auth: Authenticator,
  {
    conversationId,
    fileName,
    snippet = null,
    hideFromUser = false,
    skipDataSourceIndexing = false,
  }: {
    conversationId: string;
    fileName: string;
    snippet?: string | null;
    hideFromUser?: boolean;
    skipDataSourceIndexing?: boolean;
  }
): Promise<FileResource> {
  return FileFactory.create(auth, auth.getNonNullableUser(), {
    contentType: "text/plain",
    fileName,
    fileSize: 16,
    status: "ready",
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
      ...(hideFromUser ? { hideFromUser: true } : {}),
      ...(skipDataSourceIndexing ? { skipDataSourceIndexing: true } : {}),
    },
    snippet,
  });
}

async function fetchConversationOrThrow(
  auth: Authenticator,
  conversationId: string
): Promise<ConversationType> {
  const result = await getConversation(auth, conversationId);
  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}

function mockCopyToConversation() {
  return vi
    .spyOn(FileResource, "copyToConversation")
    .mockImplementation(async (auth, { sourceId, conversationId }) => {
      const sourceFile = await FileResource.fetchById(auth, sourceId);
      if (!sourceFile) {
        throw new Error(`Missing source file in test: ${sourceId}`);
      }

      const copiedFile = await FileFactory.create(auth, auth.user(), {
        contentType: sourceFile.contentType,
        fileName: sourceFile.fileName,
        fileSize: sourceFile.fileSize,
        status: "ready",
        useCase: sourceFile.useCase,
        useCaseMetadata: {
          ...(sourceFile.useCaseMetadata ?? {}),
          conversationId,
        },
        snippet: sourceFile.snippet,
      });

      return new Ok(copiedFile);
    });
}

function mockDatasourceSeeding(
  dataSource: Awaited<
    ReturnType<typeof DataSourceViewFactory.folder>
  >["dataSource"]
) {
  const getOrCreateConversationDataSourceFromFileSpy = vi
    .spyOn(dataSourcesModule, "getOrCreateConversationDataSourceFromFile")
    .mockResolvedValue(new Ok(dataSource));
  const processAndUpsertToDataSourceSpy = vi
    .spyOn(fileUpsertModule, "processAndUpsertToDataSource")
    .mockImplementation(async (_auth, _dataSource, { file }) => new Ok(file));

  return {
    getOrCreateConversationDataSourceFromFileSpy,
    processAndUpsertToDataSourceSpy,
  };
}

function mockContentNodeAttachments(nodeDataSourceViewId: number) {
  return vi
    .spyOn(contentFragmentModule, "getContentFragmentBlob")
    .mockImplementation(async (_auth, cf) => {
      if (!("nodeId" in cf)) {
        throw new Error(
          "Unexpected file content fragment input in content node mock."
        );
      }

      return new Ok({
        contentType: "text/plain",
        fileId: null,
        nodeId: cf.nodeId,
        nodeDataSourceViewId,
        nodeType: "document",
        sourceUrl: null,
        textBytes: null,
        title: cf.title,
      });
    });
}

describe("createConversationFork", () => {
  it("creates the child conversation, sole participant, and lineage row", async () => {
    const { auth, globalSpace, user } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "How should I continue this?",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    expect(childConversation.title).toBeNull();
    expect(childConversation.spaceId).toBe(globalSpace.sId);
    expect(childConversation.depth).toBe(parentConversation.depth + 1);
    expect(childConversation.forkingData).toEqual({
      forkedFrom: {
        parentConversationId: parentConversation.sId,
        parentConversationTitle: "Parent conversation",
        sourceMessageId: sourceMessage.sId,
        branchedAt: expect.any(Number),
        user: user.toJSON(),
      },
    });
    expect(childConversation.content).toHaveLength(1);
    expect(isCompactionMessageType(childConversation.content[0]![0]!)).toBe(
      true
    );
    expect(
      isCompactionMessageType(childConversation.content[0]![0]!)
        ? childConversation.content[0]![0]!.status
        : null
    ).toBe("created");
    expect(vi.mocked(launchCompactionWorkflow)).toHaveBeenCalledWith(
      expect.objectContaining({
        auth,
        conversationId: childConversation.sId,
        sourceConversation: {
          conversationId: parentConversation.sId,
          messageRank: sourceMessage.rank,
        },
      })
    );

    const forkRow = await ConversationForkModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        childConversationId: childConversation.id,
      },
    });

    expect(forkRow).not.toBeNull();
    expect(forkRow?.parentConversationId).toBe(parentConversation.id);
    expect(forkRow?.sourceMessageId).toBe(sourceMessage.id);
    expect(forkRow?.createdByUserId).toBe(user.id);

    const participants = await ConversationResource.listParticipantDetails(
      auth,
      childConversation
    );
    expect(participants).toEqual([
      {
        userId: user.id,
        action: "subscribed",
      },
    ]);
  });

  it("resolves the latest completed main-thread agent message when no source is provided", async () => {
    const { auth } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const firstUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "First turn",
    });
    const firstAgentMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: firstUserMessage.id,
      status: "succeeded",
    });

    const secondUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 2,
      content: "Second turn",
    });
    await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 3,
      parentId: secondUserMessage.id,
      status: "created",
    });

    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "open",
      previousMessageId: firstAgentMessage.id,
      conversationId: parentConversation.id,
      userId: auth.getNonNullableUser().id,
    });

    const branchUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 10,
      content: "Branch turn",
      branchId: branch.id,
    });
    await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 11,
      parentId: branchUserMessage.id,
      status: "succeeded",
      branchId: branch.id,
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    expect(childConversation.forkingData?.forkedFrom?.sourceMessageId).toBe(
      firstAgentMessage.sId
    );
  });

  it("returns invalid_request_error when the source message is not forkable", async () => {
    const { auth } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Still waiting for the model",
    });
    const pendingAgentMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "created",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: pendingAgentMessage.sId,
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.code : "").toBe(
      "invalid_request_error"
    );
  });

  it("copies enabled conversation MCP server views into the child conversation", async () => {
    const { auth, globalSpace, workspace } =
      await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const enabledRemoteServer = await RemoteMCPServerFactory.create(workspace);
    const enabledMCPServerView = await MCPServerViewFactory.create(
      workspace,
      enabledRemoteServer.sId,
      globalSpace
    );
    const disabledRemoteServer = await RemoteMCPServerFactory.create(workspace);
    const disabledMCPServerView = await MCPServerViewFactory.create(
      workspace,
      disabledRemoteServer.sId,
      globalSpace
    );

    const enabledUpsertResult = await ConversationResource.upsertMCPServerViews(
      auth,
      {
        conversation: parentConversation,
        mcpServerViews: [enabledMCPServerView],
        enabled: true,
        source: "conversation",
        agentConfigurationId: null,
      }
    );
    expect(enabledUpsertResult.isOk()).toBe(true);

    const disabledUpsertResult =
      await ConversationResource.upsertMCPServerViews(auth, {
        conversation: parentConversation,
        mcpServerViews: [disabledMCPServerView],
        enabled: false,
        source: "conversation",
        agentConfigurationId: null,
      });
    expect(disabledUpsertResult.isOk()).toBe(true);

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue with the same tools.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childMCPServerViews = await ConversationResource.fetchMCPServerViews(
      auth,
      childConversation
    );

    expect(childMCPServerViews).toHaveLength(1);
    expect(childMCPServerViews[0].mcpServerViewId).toBe(
      enabledMCPServerView.id
    );
    expect(childMCPServerViews[0].enabled).toBe(true);
    expect(childMCPServerViews[0].source).toBe("conversation");
  });

  it("copies enabled conversation skills into the child conversation", async () => {
    const { auth, globalSpace } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const enabledSkill = await SkillFactory.create(auth, {
      name: "Enabled skill",
    });
    await SkillFactory.create(auth, {
      name: "Disabled skill",
    });

    const upsertResult = await SkillResource.upsertConversationSkills(auth, {
      conversationId: parentConversation.id,
      skills: [enabledSkill],
      enabled: true,
    });
    expect(upsertResult.isOk()).toBe(true);

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue with the same skills.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childSkills = await SkillResource.listEnabledByConversation(auth, {
      conversation: childConversation,
    });

    expect(childSkills).toHaveLength(1);
    expect(childSkills[0].sId).toBe(enabledSkill.sId);
  });

  it("copies direct conversation file attachments into the child conversation", async () => {
    const { auth, workspace, globalSpace } =
      await createPrivateApiMockRequest();
    const copyToConversationSpy = mockCopyToConversation();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    const {
      getOrCreateConversationDataSourceFromFileSpy,
      processAndUpsertToDataSourceSpy,
    } = mockDatasourceSeeding(dataSourceView.dataSource);

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const sourceFile = await createConversationFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "notes.txt",
      snippet: "fork me",
    });

    let parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const attachmentResult = await postNewContentFragment(
      auth,
      parentConversationWithContent,
      {
        title: "Notes",
        fileId: sourceFile.sId,
      },
      null
    );
    expect(attachmentResult.isOk()).toBe(true);

    parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const userMessage = await createUserMessage(auth, {
      conversation: parentConversationWithContent,
      rank: 1,
      content: "Please branch this.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversationWithContent,
      rank: 2,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childAttachments = await listAttachments(auth, {
      conversation: childConversation,
    });
    const childFileAttachments = childAttachments.filter(isFileAttachmentType);

    expect(childFileAttachments).toHaveLength(1);
    expect(childFileAttachments[0]?.title).toBe("notes.txt");
    expect(childFileAttachments[0]?.fileId).not.toBe(sourceFile.sId);

    const copiedFiles = await FileResource.fetchByIds(auth, [
      childFileAttachments[0]!.fileId,
    ]);
    expect(copiedFiles).toHaveLength(1);
    expect(copiedFiles[0]?.useCaseMetadata?.conversationId).toBe(
      childConversation.sId
    );
    expect(copiedFiles[0]?.snippet).toBe(sourceFile.snippet);
    expect(getOrCreateConversationDataSourceFromFileSpy).toHaveBeenCalledTimes(
      1
    );
    expect(processAndUpsertToDataSourceSpy).toHaveBeenCalledTimes(1);
    expect(processAndUpsertToDataSourceSpy.mock.calls[0]?.[2].file.sId).toBe(
      copiedFiles[0]?.sId
    );

    copyToConversationSpy.mockRestore();
    getOrCreateConversationDataSourceFromFileSpy.mockRestore();
    processAndUpsertToDataSourceSpy.mockRestore();
  }, 15_000);

  it("only copies attachments that existed at the selected source message", async () => {
    const { auth, workspace, globalSpace } =
      await createPrivateApiMockRequest();
    const copyToConversationSpy = mockCopyToConversation();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    const {
      getOrCreateConversationDataSourceFromFileSpy,
      processAndUpsertToDataSourceSpy,
    } = mockDatasourceSeeding(dataSourceView.dataSource);

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const firstFile = await createConversationFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "first.txt",
      snippet: "first",
    });
    const secondFile = await createConversationFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "second.txt",
      snippet: "second",
    });

    let parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const firstAttachmentResult = await postNewContentFragment(
      auth,
      parentConversationWithContent,
      {
        title: "First attachment",
        fileId: firstFile.sId,
      },
      null
    );
    expect(firstAttachmentResult.isOk()).toBe(true);

    parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const userMessage = await createUserMessage(auth, {
      conversation: parentConversationWithContent,
      rank: 1,
      content: "Fork from here.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversationWithContent,
      rank: 2,
      parentId: userMessage.id,
      status: "succeeded",
    });

    parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const secondAttachmentResult = await postNewContentFragment(
      auth,
      parentConversationWithContent,
      {
        title: "Second attachment",
        fileId: secondFile.sId,
      },
      null
    );
    expect(secondAttachmentResult.isOk()).toBe(true);

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childAttachments = await listAttachments(auth, {
      conversation: childConversation,
    });
    const childFileAttachments = childAttachments.filter(isFileAttachmentType);

    expect(childFileAttachments).toHaveLength(1);
    expect(childFileAttachments[0]?.title).toBe("first.txt");

    copyToConversationSpy.mockRestore();
    getOrCreateConversationDataSourceFromFileSpy.mockRestore();
    processAndUpsertToDataSourceSpy.mockRestore();
  }, 15_000);

  it("carries over tool output attachments from the selected source message", async () => {
    const { auth, workspace, globalSpace } =
      await createPrivateApiMockRequest();
    const copyToConversationSpy = mockCopyToConversation();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    const {
      getOrCreateConversationDataSourceFromFileSpy,
      processAndUpsertToDataSourceSpy,
    } = mockDatasourceSeeding(dataSourceView.dataSource);

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const sourceToolOutput = await createToolOutputFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "before-fork.txt",
      snippet: "before",
    });
    const laterToolOutput = await createToolOutputFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "after-fork.txt",
      snippet: "after",
    });

    const firstUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      content: "Fork from the next answer.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 2,
      parentId: firstUserMessage.id,
      status: "succeeded",
      generatedFileId: sourceToolOutput.id,
    });
    const secondUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 3,
      content: "Too late for the fork.",
    });
    await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 4,
      parentId: secondUserMessage.id,
      status: "succeeded",
      generatedFileId: laterToolOutput.id,
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childAttachments = await listAttachments(auth, {
      conversation: childConversation,
    });
    const childFileAttachments = childAttachments.filter(isFileAttachmentType);

    expect(childFileAttachments).toHaveLength(1);
    expect(childFileAttachments[0]?.title).toBe("before-fork.txt");
    expect(childFileAttachments[0]?.fileId).not.toBe(sourceToolOutput.sId);

    const copiedFiles = await FileResource.fetchByIds(auth, [
      childFileAttachments[0]!.fileId,
    ]);
    expect(copiedFiles).toHaveLength(1);
    expect(copiedFiles[0]?.useCase).toBe("tool_output");
    expect(copiedFiles[0]?.useCaseMetadata?.conversationId).toBe(
      childConversation.sId
    );
    expect(copiedFiles[0]?.snippet).toBe(sourceToolOutput.snippet);
    expect(getOrCreateConversationDataSourceFromFileSpy).toHaveBeenCalledTimes(
      1
    );
    expect(processAndUpsertToDataSourceSpy).toHaveBeenCalledTimes(1);
    expect(processAndUpsertToDataSourceSpy.mock.calls[0]?.[2].file.sId).toBe(
      copiedFiles[0]?.sId
    );

    copyToConversationSpy.mockRestore();
    getOrCreateConversationDataSourceFromFileSpy.mockRestore();
    processAndUpsertToDataSourceSpy.mockRestore();
  }, 15_000);

  it("does not seed the child conversation datasource for skipped tool outputs", async () => {
    const { auth, workspace, globalSpace } =
      await createPrivateApiMockRequest();
    const copyToConversationSpy = mockCopyToConversation();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    const {
      getOrCreateConversationDataSourceFromFileSpy,
      processAndUpsertToDataSourceSpy,
    } = mockDatasourceSeeding(dataSourceView.dataSource);

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const skippedToolOutput = await createToolOutputFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "offloaded-output.txt",
      skipDataSourceIndexing: true,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      content: "Fork from the next answer.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 2,
      parentId: userMessage.id,
      status: "succeeded",
      generatedFileId: skippedToolOutput.id,
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childAttachments = await listAttachments(auth, {
      conversation: childConversation,
    });
    const childFileAttachments = childAttachments.filter(isFileAttachmentType);

    expect(childFileAttachments).toHaveLength(1);
    expect(getOrCreateConversationDataSourceFromFileSpy).not.toHaveBeenCalled();
    expect(processAndUpsertToDataSourceSpy).not.toHaveBeenCalled();

    copyToConversationSpy.mockRestore();
    getOrCreateConversationDataSourceFromFileSpy.mockRestore();
    processAndUpsertToDataSourceSpy.mockRestore();
  }, 15_000);

  it("preserves hidden tool output attachments in the forked conversation", async () => {
    const { auth, workspace, globalSpace } =
      await createPrivateApiMockRequest();
    const copyToConversationSpy = mockCopyToConversation();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    const {
      getOrCreateConversationDataSourceFromFileSpy,
      processAndUpsertToDataSourceSpy,
    } = mockDatasourceSeeding(dataSourceView.dataSource);

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const hiddenToolOutput = await createToolOutputFile(auth, {
      conversationId: parentConversation.sId,
      fileName: "hidden-output.txt",
      hideFromUser: true,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      content: "Fork from the next answer.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 2,
      parentId: userMessage.id,
      status: "succeeded",
      generatedFileId: hiddenToolOutput.id,
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childAttachments = await listAttachments(auth, {
      conversation: childConversation,
    });
    const childFileAttachments = childAttachments.filter(isFileAttachmentType);

    expect(childFileAttachments).toHaveLength(1);
    expect(childFileAttachments[0]?.hidden).toBe(true);

    const copiedFiles = await FileResource.fetchByIds(auth, [
      childFileAttachments[0]!.fileId,
    ]);
    expect(copiedFiles).toHaveLength(1);
    expect(copiedFiles[0]?.useCaseMetadata?.hideFromUser).toBe(true);

    copyToConversationSpy.mockRestore();
    getOrCreateConversationDataSourceFromFileSpy.mockRestore();
    processAndUpsertToDataSourceSpy.mockRestore();
  }, 15_000);

  it("reattaches content node attachments that existed at the selected source message", async () => {
    const { auth, workspace, globalSpace } =
      await createPrivateApiMockRequest();

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    const getContentFragmentBlobSpy = mockContentNodeAttachments(
      dataSourceView.id
    );

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    let parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const firstAttachmentResult = await postNewContentFragment(
      auth,
      parentConversationWithContent,
      {
        title: "First note",
        nodeId: "node_before_fork",
        nodeDataSourceViewId: dataSourceView.sId,
      },
      null
    );
    expect(firstAttachmentResult.isOk()).toBe(true);

    parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const userMessage = await createUserMessage(auth, {
      conversation: parentConversationWithContent,
      rank: 1,
      content: "Fork from here.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversationWithContent,
      rank: 2,
      parentId: userMessage.id,
      status: "succeeded",
    });

    parentConversationWithContent = await fetchConversationOrThrow(
      auth,
      parentConversation.sId
    );
    const secondAttachmentResult = await postNewContentFragment(
      auth,
      parentConversationWithContent,
      {
        title: "Second note",
        nodeId: "node_after_fork",
        nodeDataSourceViewId: dataSourceView.sId,
      },
      null
    );
    expect(secondAttachmentResult.isOk()).toBe(true);

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    const childAttachments = await listAttachments(auth, {
      conversation: childConversation,
    });
    const childContentNodeAttachments = childAttachments.filter(
      isContentNodeAttachmentType
    );

    expect(childContentNodeAttachments).toHaveLength(1);
    expect(childContentNodeAttachments[0]?.title).toBe("First note");
    expect(childContentNodeAttachments[0]?.nodeId).toBe("node_before_fork");
    expect(childContentNodeAttachments[0]?.nodeDataSourceViewId).toBe(
      dataSourceView.sId
    );

    getContentFragmentBlobSpy.mockRestore();
  });

  it("inherits the parent's requested spaces so the fork does not broaden visibility", async () => {
    const {
      auth: initialAuth,
      globalSpace,
      user,
      workspace,
    } = await createPrivateApiMockRequest({ role: "admin" });

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addMembersRes = await restrictedSpace.addMembers(initialAuth, {
      userIds: [user.sId],
    });
    expect(addMembersRes.isOk()).toBe(true);

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });
    await ConversationModel.update(
      { requestedSpaceIds: [globalSpace.id, restrictedSpace.id] },
      {
        where: {
          id: parentConversation.id,
          workspaceId: workspace.id,
        },
      }
    );

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue from the restricted state.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = await fetchConversationOrThrow(
      auth,
      result.value
    );

    expect(childConversation.requestedSpaceIds).toEqual([
      globalSpace.sId,
      restrictedSpace.sId,
    ]);

    const childConversationForOtherUser = await ConversationResource.fetchById(
      otherAuth,
      childConversation.sId
    );
    expect(childConversationForOtherUser).toBeNull();
  });
});
