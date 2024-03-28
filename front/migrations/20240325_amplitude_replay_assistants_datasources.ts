import type {
  AgentStatus,
  ModelId,
  RoleType,
  SubscriptionType,
  WhitelistableFeature,
} from "@dust-tt/types";
import { Op } from "sequelize";

import {
  trackAssistantCreated,
  trackDataSourceCreated,
} from "@app/lib/amplitude/back";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, subscriptionForWorkspace } from "@app/lib/auth";
import {
  AgentConfiguration,
  Conversation,
  DataSource,
  FeatureFlag,
  Membership,
  Message,
  User,
  UserMessage,
  Workspace,
} from "@app/lib/models";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";

async function AuthenticatorfromIds(
  userId: ModelId,
  wId: string
): Promise<Authenticator> {
  const [workspace, user] = await Promise.all([
    (async () => {
      return Workspace.findOne({
        where: {
          sId: wId,
        },
      });
    })(),
    (async () => {
      return User.findOne({
        where: {
          id: userId,
        },
      });
    })(),
  ]);

  let role = "none" as RoleType;
  let subscription: SubscriptionType | null = null;
  let flags: WhitelistableFeature[] = [];

  if (user && workspace) {
    [role, subscription, flags] = await Promise.all([
      (async (): Promise<RoleType> => {
        const membership = await Membership.findOne({
          where: {
            userId: user.id,
            workspaceId: workspace.id,
          },
        });
        return membership &&
          ["admin", "builder", "user"].includes(membership.role)
          ? (membership.role as RoleType)
          : "none";
      })(),
      subscriptionForWorkspace(workspace.sId),
      (async () => {
        return (
          await FeatureFlag.findAll({
            where: {
              workspaceId: workspace.id,
            },
          })
        ).map((flag) => flag.name);
      })(),
    ]);
  }

  return new Authenticator({
    workspace,
    user,
    role,
    subscription,
    flags,
  });
}

const maxDate = "2024-03-23";

async function populateAssistantCreated(workspace: Workspace, logger: Logger) {
  const assistants = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: ["active", "archived"] satisfies AgentStatus[],
      createdAt: {
        [Op.lt]: new Date(maxDate),
      },
    },
  });
  for (const assistant of assistants) {
    const auth = await AuthenticatorfromIds(assistant.authorId, workspace.sId);
    if (!auth.isUser()) {
      throw new Error("Only users can create agents.");
    }
    if (!auth.workspace()) {
      throw new Error("Workspace not found.");
    }
    const agentConfigType = await getAgentConfiguration(auth, assistant.sId);
    if (!agentConfigType) {
      throw new Error("Agent configuration not found." + assistant.sId);
    }
    await trackAssistantCreated(auth, { assistant: agentConfigType });
    logger.info(
      { assistantName: assistant.name, assitantSid: assistant.sId },
      "tracked assistant created"
    );
  }
}

export async function populateDataSourceCreated(
  workspace: Workspace,
  logger: Logger
) {
  const dataSources = await DataSource.findAll({
    where: {
      workspaceId: workspace.id,
      createdAt: {
        [Op.lt]: new Date(maxDate),
      },
    },
  });
  const defaultAdmin = await Membership.findOne({
    where: {
      workspaceId: workspace.id,
      role: "admin",
    },
    order: [["createdAt", "ASC"]],
    limit: 1,
  });
  for (const dataSource of dataSources) {
    const adminId = dataSource.editedByUserId || defaultAdmin?.userId;
    if (!adminId) {
      throw new Error("Admin not found.");
    }
    const auth = await AuthenticatorfromIds(adminId, workspace.sId);
    if (!auth.isUser()) {
      throw new Error("Only users can create agents.");
    }
    if (!auth.workspace()) {
      throw new Error("Workspace not found.");
    }
    const ds = await getDataSource(auth, dataSource.name);
    if (!ds) {
      throw new Error(
        `Data source not found: ${dataSource.name} in workspace ${workspace.sId}`
      );
    }
    await trackDataSourceCreated(auth, {
      dataSource: ds,
    });
    logger.info(
      {
        dataSourceName: dataSource.name,
        dataSourceSid: dataSource.id,
      },
      "tracked data source created"
    );
  }
}

const AMMPLITUDE_ENABLED = process.env.AMPLITUDE_ENABLED;
async function main() {
  const childLogger = logger.child({
    AMMPLITUDE_ENABLED,
    tag: "AmplitudeMigration2",
  });

  const conversations = await Conversation.findAll({
    where: {
      createdAt: {
        [Op.lt]: new Date(maxDate),
      },
    },
  });
  const workspaceIDS = new Set<ModelId>();
  for (const conversation of conversations) {
    workspaceIDS.add(conversation.workspaceId);
  }
  childLogger.info(
    {
      conversations: conversations.length,
      workspaces: workspaceIDS.size,
    },
    `Processing`
  );

  for (const workspaceID of workspaceIDS) {
    const workspace = await Workspace.findOne({
      where: {
        id: workspaceID,
      },
    });
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceID}`);
    }
    childLogger.info(
      { workspaceId: workspace.sId },
      "[AmplitudeMigration2] Processing workspace"
    );
    await populateAssistantCreated(workspace, childLogger);
    await populateDataSourceCreated(workspace);
  }
}

main().catch(console.error);
