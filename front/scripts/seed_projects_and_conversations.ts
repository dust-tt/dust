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
import { makeScript } from "@app/scripts/helpers";
import { GLOBAL_AGENTS_SID } from "@app/types";

const PROJECT_NAMES = [
  "Product Roadmap Q1",
  "Marketing Campaign 2025",
  "Engineering Sprint Planning",
  "Customer Success Initiatives",
  "Sales Pipeline Analysis",
  "HR Onboarding Redesign",
  "Finance Budget Review",
  "Legal Compliance Audit",
  "Design System Updates",
  "Infrastructure Modernization",
  "Data Analytics Platform",
  "Mobile App Development",
  "Security Assessment",
  "Customer Feedback Analysis",
  "Competitive Research",
  "Partner Integration",
  "Support Automation",
  "Content Strategy",
  "Performance Optimization",
  "User Research Studies",
];

const CONVERSATION_TOPICS = [
  "Weekly standup notes",
  "Feature discussion",
  "Bug triage session",
  "Planning meeting",
  "Review feedback",
  "Brainstorming ideas",
  "Status update",
  "Decision log",
  "Research findings",
  "Action items",
];

makeScript(
  {
    email: {
      type: "string",
      describe: "Email of the user to create projects and conversations for",
      default: "jd@dust.tt",
    },
    projectCount: {
      type: "number",
      describe: "Number of projects to create",
      default: 20,
    },
    conversationsPerProject: {
      type: "number",
      describe: "Number of conversations per project",
      default: 5,
    },
  },
  async ({ execute, email, projectCount, conversationsPerProject }, logger) => {
    logger.info({ email }, "Looking up user...");

    const user = await UserResource.fetchByEmail(email);
    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    logger.info({ userId: user.sId, email: user.email }, "User found");

    // Get the user's workspace membership
    const { memberships, total } =
      await MembershipResource.getLatestMemberships({
        users: [user],
      });
    if (total === 0) {
      throw new Error(`User ${email} has no workspace memberships`);
    }

    // Use the first workspace - look it up by the workspaceId
    const membership = memberships[0];
    const workspaceModelId = membership.workspaceId;

    // Look up the workspace to get its sId
    const { WorkspaceResource } = await import(
      "@app/lib/resources/workspace_resource"
    );
    const workspaceResource =
      await WorkspaceResource.fetchByModelId(workspaceModelId);
    if (!workspaceResource) {
      throw new Error(`Workspace with id ${workspaceModelId} not found`);
    }
    const workspaceId = workspaceResource.sId;

    logger.info({ workspaceId }, "Using workspace");

    // Create authenticator
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspaceId
    );

    const workspace = auth.getNonNullableWorkspace();

    // Get the global group (for making projects public/open)
    const globalGroupResult =
      await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (globalGroupResult.isErr()) {
      throw new Error(
        `Failed to fetch global group: ${globalGroupResult.error.message}`
      );
    }
    const globalGroup = globalGroupResult.value;

    logger.info({ globalGroupId: globalGroup.sId }, "Global group found");

    // Create projects
    const createdProjects: SpaceResource[] = [];
    const projectNamesToUse = PROJECT_NAMES.slice(0, projectCount);

    // If we need more than PROJECT_NAMES, generate additional names
    for (let i = PROJECT_NAMES.length; i < projectCount; i++) {
      projectNamesToUse.push(`Project ${i + 1}`);
    }

    for (const projectName of projectNamesToUse) {
      logger.info({ projectName }, "Creating project...");

      if (execute) {
        // Check if project already exists
        const existingSpaces = await SpaceResource.listWorkspaceSpaces(auth, {
          includeProjectSpaces: true,
        });
        const existingProject = existingSpaces.find(
          (s) => s.name === projectName && s.kind === "project"
        );

        if (existingProject) {
          logger.info(
            { projectName, sId: existingProject.sId },
            "Project already exists, using existing"
          );
          createdProjects.push(existingProject);
          continue;
        }

        // Create a new public project (with global group as member)
        const project = await SpaceResource.makeNew(
          {
            name: projectName,
            kind: "project",
            workspaceId: workspace.id,
          },
          { members: [globalGroup] }
        );

        logger.info({ projectName, sId: project.sId }, "Project created");
        createdProjects.push(project);
      }
    }

    logger.info(
      { count: createdProjects.length },
      "Projects created/found, now creating conversations..."
    );

    // Create conversations in each project
    for (const project of createdProjects) {
      for (let i = 0; i < conversationsPerProject; i++) {
        const topicIndex = i % CONVERSATION_TOPICS.length;
        const title = `${CONVERSATION_TOPICS[topicIndex]} - ${project.name}`;
        const conversationSId = generateRandomModelSId();

        logger.info(
          { title, projectSId: project.sId },
          "Creating conversation..."
        );

        if (execute) {
          // Check if conversation exists (unlikely with random sId but be safe)
          const existingConversation = await ConversationResource.fetchById(
            auth,
            conversationSId,
            { dangerouslySkipPermissionFiltering: true, includeDeleted: true }
          );

          if (existingConversation) {
            logger.info(
              { sId: conversationSId },
              "Conversation exists, skipping"
            );
            continue;
          }

          // Create conversation in the project space
          const conversation = await ConversationResource.makeNew(
            auth,
            {
              sId: conversationSId,
              title,
              visibility: "unlisted",
              depth: 0,
              spaceId: project.id,
              requestedSpaceIds: [project.id],
            },
            project
          );

          // Add user as participant
          await ConversationResource.upsertParticipation(auth, {
            conversation: conversation.toJSON(),
            action: "posted",
            user: user.toJSON(),
            lastReadAt: new Date(),
          });

          // Create a simple exchange with user message and agent response
          const userContent = `Let's discuss ${CONVERSATION_TOPICS[topicIndex].toLowerCase()} for ${project.name}.`;
          const agentContent = `I'd be happy to help with ${CONVERSATION_TOPICS[topicIndex].toLowerCase()} for ${project.name}. What specific aspects would you like to cover?`;

          // Create user message
          const userMessageRow = await UserMessageModel.create({
            userId: user.id,
            workspaceId: workspace.id,
            content: userContent,
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
            rank: 0,
            conversationId: conversation.id,
            parentId: null,
            userMessageId: userMessageRow.id,
            workspaceId: workspace.id,
          });

          // Create agent message
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
              value: agentContent,
            },
          });

          await MessageModel.create({
            sId: generateRandomModelSId(),
            rank: 1,
            conversationId: conversation.id,
            parentId: userMsgRow.id,
            agentMessageId: agentMessageRow.id,
            workspaceId: workspace.id,
          });

          logger.info(
            { sId: conversationSId, title },
            "Conversation created with messages"
          );
        }
      }
    }

    logger.info(
      {
        projectsCreated: execute ? createdProjects.length : projectCount,
        conversationsCreated: execute
          ? createdProjects.length * conversationsPerProject
          : projectCount * conversationsPerProject,
      },
      "Seed completed"
    );
  }
);
