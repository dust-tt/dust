import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
} from "@app/types/groups";
import { faker } from "@faker-js/faker";

interface SeedConfig {
  workspaceId: string;
  conversationCount: number;
  projectCount: number;
  privateRatio: number;
  messagesPerConversation: number;
}

interface ConversationToCreate {
  index: number;
  space: SpaceResource | null;
  title: string;
  messages: Array<{
    userContent: string;
    agentContent: string;
  }>;
}

function generateConversationTitle(): string {
  const templates = [
    `Help with ${faker.company.buzzPhrase()}`,
    `Question about ${faker.commerce.productName()}`,
    `Understanding ${faker.hacker.noun()}`,
    `How to ${faker.hacker.verb()} ${faker.hacker.noun()}`,
    `${faker.company.buzzVerb()} ${faker.company.buzzNoun()}`,
    `Review of ${faker.commerce.productName()}`,
    `Explain ${faker.science.chemicalElement().name}`,
    `${faker.word.adjective()} ${faker.word.noun()} guide`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateUserMessage(): string {
  const templates = [
    `Can you help me understand ${faker.company.buzzPhrase()}?`,
    `I'm trying to ${faker.hacker.verb()} the ${faker.hacker.noun()}. Any suggestions?`,
    `What's the best approach to ${faker.company.buzzVerb()} ${faker.company.buzzNoun()}?`,
    `Could you explain how ${faker.commerce.productName()} works?`,
    `I need help with ${faker.hacker.adjective()} ${faker.hacker.noun()} implementation.`,
    `Is there a way to ${faker.hacker.verb()} without ${faker.hacker.ingverb()}?`,
    `What are the benefits of ${faker.company.buzzPhrase()}?`,
    `How do I get started with ${faker.company.buzzNoun()}?`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateAgentResponse(): string {
  const paragraphs = faker.lorem.paragraphs({ min: 1, max: 3 });
  const bullets = Array.from({ length: faker.number.int({ min: 2, max: 4 }) })
    .map(() => `- ${faker.lorem.sentence()}`)
    .join("\n");
  return `${paragraphs}\n\nHere are some key points:\n${bullets}`;
}

async function createProject(
  auth: Authenticator,
  workspace: { id: number },
  creatorId: number,
  projectName: string
): Promise<SpaceResource> {
  const existingSpaces = await SpaceResource.listProjectSpaces(auth);
  const existingSpace = existingSpaces.find((s) => s.name === projectName);
  if (existingSpace) {
    return existingSpace;
  }

  const memberGroupName = `${PROJECT_GROUP_PREFIX} ${projectName}`;
  let memberGroup = await GroupResource.fetchByName(auth, memberGroupName);
  if (!memberGroup) {
    memberGroup = await GroupResource.makeNew({
      name: memberGroupName,
      workspaceId: workspace.id,
      kind: "regular",
    });
  }

  const editorGroupName = `${PROJECT_EDITOR_GROUP_PREFIX} ${projectName}`;
  let editorGroup = await GroupResource.fetchByName(auth, editorGroupName);
  if (!editorGroup) {
    editorGroup = await GroupResource.makeNew(
      {
        name: editorGroupName,
        workspaceId: workspace.id,
        kind: "space_editors",
      },
      {
        memberIds: [creatorId],
      }
    );
  }

  return SpaceResource.makeNew(
    {
      name: projectName,
      kind: "project",
      workspaceId: workspace.id,
    },
    { members: [memberGroup], editors: [editorGroup] }
  );
}

async function createConversation(
  auth: Authenticator,
  user: UserResource,
  workspace: { id: number },
  conv: ConversationToCreate,
  logger: Logger
): Promise<void> {
  const conversation = await ConversationResource.makeNew(
    auth,
    {
      sId: generateRandomModelSId(),
      title: conv.title,
      visibility: "unlisted",
      depth: 0,
      requestedSpaceIds: conv.space ? [conv.space.id] : [],
      spaceId: conv.space?.id ?? null,
    },
    conv.space
  );

  await ConversationResource.upsertParticipation(auth, {
    conversation: conversation.toJSON(),
    action: "posted",
    user: user.toJSON(),
    lastReadAt: new Date(),
  });

  for (let i = 0; i < conv.messages.length; i++) {
    const exchange = conv.messages[i];

    const userMessageRow = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: exchange.userContent,
      userContextUsername: user.username ?? "dev-user",
      userContextTimezone: "UTC",
      userContextFullName: user.fullName() ?? "Dev User",
      userContextEmail: user.email ?? "dev@dust.tt",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const userMsgRow = await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: i * 2,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: userMessageRow.id,
      workspaceId: workspace.id,
    });

    const agentMessageRow = await AgentMessageModel.create({
      status: "succeeded",
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      agentConfigurationVersion: 0,
      workspaceId: workspace.id,
      skipToolsValidation: false,
    });

    await AgentStepContentResource.createNewVersion({
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: {
        type: "text_content",
        value: exchange.agentContent,
      },
    });

    await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: i * 2 + 1,
      conversationId: conversation.id,
      parentId: userMsgRow.id,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
    });
  }

  logger.info(
    { conversationSId: conversation.sId, index: conv.index },
    "Conversation created"
  );
}

async function fetchWorkspaceAndUser(workspaceId: string): Promise<{
  workspace: WorkspaceResource;
  user: UserResource;
  auth: Authenticator;
}> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found.`);
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: renderLightWorkspaceType({ workspace }),
    roles: ["admin"],
  });
  if (memberships.length === 0) {
    throw new Error(`No admin user found in workspace ${workspaceId}.`);
  }

  const membershipUser = memberships[0].user;
  if (!membershipUser) {
    throw new Error("Membership has no associated user.");
  }

  const user = await UserResource.fetchById(membershipUser.sId);
  if (!user) {
    throw new Error("User not found.");
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspaceId
  );

  return { workspace, user, auth };
}

function calculateDistribution(config: SeedConfig): {
  privateCount: number;
  projectConvCount: number;
  convsPerProject: number;
} {
  const privateCount = Math.floor(
    config.conversationCount * config.privateRatio
  );
  const projectConvCount = config.conversationCount - privateCount;
  const convsPerProject =
    config.projectCount > 0
      ? Math.ceil(projectConvCount / config.projectCount)
      : 0;

  return { privateCount, projectConvCount, convsPerProject };
}

async function createProjects(
  auth: Authenticator,
  workspace: WorkspaceResource,
  user: UserResource,
  projectCount: number,
  logger: Logger
): Promise<SpaceResource[]> {
  const projects: SpaceResource[] = [];
  logger.info({ count: projectCount }, "Creating projects");

  for (let i = 0; i < projectCount; i++) {
    const projectName = `Project ${faker.company.buzzNoun()} ${i + 1}`;
    const project = await createProject(
      auth,
      { id: workspace.id },
      user.id,
      projectName
    );
    projects.push(project);
    logger.info(
      { projectSId: project.sId, name: projectName },
      "Project created"
    );
  }

  return projects;
}

function generateMessages(
  count: number
): Array<{ userContent: string; agentContent: string }> {
  return Array.from({ length: count }).map(() => ({
    userContent: generateUserMessage(),
    agentContent: generateAgentResponse(),
  }));
}

function buildConversationSpecs(
  projects: SpaceResource[],
  distribution: {
    privateCount: number;
    projectConvCount: number;
    convsPerProject: number;
  },
  conversationCount: number,
  messagesPerConversation: number
): ConversationToCreate[] {
  const specs: ConversationToCreate[] = [];

  for (let i = 0; i < distribution.privateCount; i++) {
    specs.push({
      index: i,
      space: null,
      title: generateConversationTitle(),
      messages: generateMessages(messagesPerConversation),
    });
  }

  let projectConvIndex = distribution.privateCount;
  for (const project of projects) {
    for (let c = 0; c < distribution.convsPerProject; c++) {
      if (projectConvIndex >= conversationCount) {
        break;
      }
      specs.push({
        index: projectConvIndex,
        space: project,
        title: generateConversationTitle(),
        messages: generateMessages(messagesPerConversation),
      });
      projectConvIndex++;
    }
  }

  return specs;
}

async function seedConversations(
  config: SeedConfig,
  logger: Logger,
  execute: boolean
): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This script can only be run in development.");
  }

  logger.info(config, "Starting seed conversations script");

  const { workspace, user, auth } = await fetchWorkspaceAndUser(
    config.workspaceId
  );
  const distribution = calculateDistribution(config);

  logger.info(
    {
      privateCount: distribution.privateCount,
      projectConvCount: distribution.projectConvCount,
      projectCount: config.projectCount,
      convsPerProject: distribution.convsPerProject,
    },
    "Distribution calculated"
  );

  if (!execute) {
    logger.info("Dry run mode - no changes will be made");
    logger.info(
      {
        wouldCreateProjects: config.projectCount,
        wouldCreatePrivateConversations: distribution.privateCount,
        wouldCreateProjectConversations: distribution.projectConvCount,
      },
      "Would create"
    );
    return;
  }

  const projects = await createProjects(
    auth,
    workspace,
    user,
    config.projectCount,
    logger
  );

  const conversationsToCreate = buildConversationSpecs(
    projects,
    distribution,
    config.conversationCount,
    config.messagesPerConversation
  );

  logger.info(
    { count: conversationsToCreate.length },
    "Creating conversations"
  );

  await concurrentExecutor(
    conversationsToCreate,
    async (conv) => {
      await createConversation(auth, user, { id: workspace.id }, conv, logger);
    },
    { concurrency: 10 }
  );

  logger.info(
    {
      projectsCreated: projects.length,
      conversationsCreated: conversationsToCreate.length,
    },
    "Seed completed"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace sId to seed conversations in",
      demandOption: true,
    },
    conversationCount: {
      type: "number",
      description: "Total number of conversations to create",
      default: 200,
    },
    projectCount: {
      type: "number",
      description: "Number of projects to create",
      default: 100,
    },
    privateRatio: {
      type: "number",
      description: "Ratio of private conversations (0-1)",
      default: 0.5,
    },
    messagesPerConversation: {
      type: "number",
      description: "Number of message exchanges per conversation",
      default: 3,
    },
  },
  async (
    {
      workspaceId,
      conversationCount,
      projectCount,
      privateRatio,
      messagesPerConversation,
      execute,
    },
    logger
  ) => {
    await seedConversations(
      {
        workspaceId,
        conversationCount,
        projectCount,
        privateRatio,
        messagesPerConversation,
      },
      logger,
      execute
    );
  }
);
