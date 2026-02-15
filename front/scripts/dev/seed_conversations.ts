import { faker } from "@faker-js/faker";

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
  workspace: { id: number },
  creatorId: number,
  projectName: string
): Promise<SpaceResource> {
  const memberGroup = await GroupResource.makeNew({
    name: `${PROJECT_GROUP_PREFIX} ${projectName}`,
    workspaceId: workspace.id,
    kind: "regular",
  });

  const editorGroup = await GroupResource.makeNew(
    {
      name: `${PROJECT_EDITOR_GROUP_PREFIX} ${projectName}`,
      workspaceId: workspace.id,
      kind: "space_editors",
    },
    {
      memberIds: [creatorId],
    }
  );

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
    if (process.env.NODE_ENV !== "development") {
      throw new Error("This script can only be run in development.");
    }

    logger.info(
      {
        workspaceId,
        conversationCount,
        projectCount,
        privateRatio,
        messagesPerConversation,
      },
      "Starting seed conversations script"
    );

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

    const privateCount = Math.floor(conversationCount * privateRatio);
    const projectConvCount = conversationCount - privateCount;
    const convsPerProject =
      projectCount > 0 ? Math.ceil(projectConvCount / projectCount) : 0;

    logger.info(
      {
        privateCount,
        projectConvCount,
        projectCount,
        convsPerProject,
      },
      "Distribution calculated"
    );

    if (!execute) {
      logger.info("Dry run mode - no changes will be made");
      logger.info(
        {
          wouldCreateProjects: projectCount,
          wouldCreatePrivateConversations: privateCount,
          wouldCreateProjectConversations: projectConvCount,
        },
        "Would create"
      );
      return;
    }

    const projects: SpaceResource[] = [];
    logger.info({ count: projectCount }, "Creating projects");

    for (let i = 0; i < projectCount; i++) {
      const projectName = `Project ${faker.company.buzzNoun()} ${i + 1}`;
      const project = await createProject(
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

    const conversationsToCreate: ConversationToCreate[] = [];

    for (let i = 0; i < privateCount; i++) {
      const messages = Array.from({ length: messagesPerConversation }).map(
        () => ({
          userContent: generateUserMessage(),
          agentContent: generateAgentResponse(),
        })
      );
      conversationsToCreate.push({
        index: i,
        space: null,
        title: generateConversationTitle(),
        messages,
      });
    }

    let projectConvIndex = privateCount;
    for (let p = 0; p < projects.length; p++) {
      const project = projects[p];
      for (let c = 0; c < convsPerProject; c++) {
        if (projectConvIndex >= conversationCount) {
          break;
        }
        const messages = Array.from({ length: messagesPerConversation }).map(
          () => ({
            userContent: generateUserMessage(),
            agentContent: generateAgentResponse(),
          })
        );
        conversationsToCreate.push({
          index: projectConvIndex,
          space: project,
          title: generateConversationTitle(),
          messages,
        });
        projectConvIndex++;
      }
    }

    logger.info(
      { count: conversationsToCreate.length },
      "Creating conversations"
    );

    await concurrentExecutor(
      conversationsToCreate,
      async (conv) => {
        await createConversation(
          auth,
          user,
          { id: workspace.id },
          conv,
          logger
        );
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
);
