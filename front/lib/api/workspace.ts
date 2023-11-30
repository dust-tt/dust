import {
  RoleType,
  UserType,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@dust-tt/types";
import { MembershipInvitationType } from "@dust-tt/types";
import { Op, Transaction } from "sequelize";

import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentDataSourceConfiguration,
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
  AgentGenerationConfiguration,
  AgentMessage,
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
  App,
  Clone,
  Conversation,
  Dataset,
  Key,
  Membership,
  MembershipInvitation,
  Message,
  Provider,
  RetrievalDocument,
  RetrievalDocumentChunk,
  Run,
  Subscription,
  User,
  UserMessage,
  UserMetadata,
  Workspace,
} from "@app/lib/models";
import {
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/assistant/agent";
import {
  ContentFragment,
  ConversationParticipant,
  Mention,
  MessageReaction,
} from "@app/lib/models/assistant/conversation";
import { PlanInvitation } from "@app/lib/models/plan";

export async function getWorkspaceInfos(
  wId: string
): Promise<WorkspaceType | null> {
  const workspace = await Workspace.findOne({
    where: {
      sId: wId,
    },
  });

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    allowedDomain: workspace.allowedDomain,
    role: "none",
    segmentation: workspace.segmentation,
  };
}

export async function setInternalWorkspaceSegmentation(
  auth: Authenticator,
  segmentation: WorkspaceSegmentationType
): Promise<WorkspaceType> {
  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user || !auth.isDustSuperUser()) {
    throw new Error("Forbidden update to workspace segmentation.");
  }

  const workspace = await Workspace.findOne({
    where: {
      id: owner.id,
    },
  });

  if (!workspace) {
    throw new Error("Could not find workspace.");
  }

  await workspace.update({
    segmentation,
  });

  return {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    allowedDomain: workspace.allowedDomain,
    role: "none",
    segmentation: workspace.segmentation,
  };
}

/**
 * Returns the users members of the workspace associated with the authenticator (without listing
 * their own workspaces).
 * @param auth Authenticator
 * @param role RoleType optional filter on role
 * @returns UserType[] members of the workspace
 */
export async function getMembers(
  auth: Authenticator,
  role?: RoleType
): Promise<UserType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }
  const whereClause = role
    ? { workspaceId: owner.id, role }
    : { workspaceId: owner.id };
  const memberships = await Membership.findAll({
    where: whereClause,
  });

  const users = await User.findAll({
    where: {
      id: memberships.map((m) => m.userId),
    },
  });

  return users.map((u) => {
    const m = memberships.find((m) => m.userId === u.id);
    let role = "none" as RoleType;
    if (m) {
      switch (m.role) {
        case "admin":
        case "builder":
        case "user":
          role = m.role;
          break;
        default:
          role = "none";
      }
    }

    return {
      id: u.id,
      provider: u.provider,
      providerId: u.providerId,
      username: u.username,
      email: u.email,
      fullName: u.firstName + (u.lastName ? ` ${u.lastName}` : ""),
      firstName: u.firstName,
      lastName: u.lastName,
      image: null,
      workspaces: [{ ...owner, role }],
    };
  });
}

/**
 * Returns the pending inviations associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */
export async function getPendingInvitations(
  auth: Authenticator
): Promise<MembershipInvitationType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const invitations = await MembershipInvitation.findAll({
    where: {
      workspaceId: owner.id,
      status: "pending",
    },
  });

  return invitations.map((i) => {
    return {
      id: i.id,
      status: i.status,
      inviteEmail: i.inviteEmail,
    };
  });
}

/**
 * Deletes all workspace related data from the db
 * Requires the authenticator to be a super admin.
 */
export async function dangerousSuperAdminDeleteWorkspaceData({
  auth,
}: {
  auth: Authenticator;
}): Promise<void> {
  // Verify auth is super admin and workspace exists.
  if (!auth.isDustSuperUser()) {
    throw new Error("Unauthorized.");
  }
  const workspace = auth.workspace();
  if (!workspace) {
    throw new Error("Workspace does not exist.");
  }

  // Workspace must have no managed data sources.
  const dataSources = await getDataSources(auth);
  if (dataSources.length > 0) {
    throw new Error("Workspace has data sources. Delete them first.");
  }

  // For now we don't support deleting workspaces who had a paid subscription at some point.
  const subscriptions = await Subscription.findAll({
    where: {
      workspaceId: workspace.id,
      stripeSubscriptionId: {
        [Op.not]: null,
      },
    },
  });
  if (subscriptions.length > 0) {
    throw new Error(
      "Workspace has/had a paid subscription. We do not support deleting such workspaces."
    );
  }

  // WE DO NOT RELY ON CASCADE DELETION.
  await front_sequelize.transaction(async (t) => {
    await _deleteConversations(workspace, t);
    await _deleteAgents(workspace, t);
    await Promise.all([
      _deleteApps(workspace, t),
      _deleteInvitations(workspace, t),
      _deleteMembershipsAndUserIfOneOnly(workspace, t),
    ]);
    await _deleteWorkspace(workspace, t);
  });
  return;
}

const _deleteConversations = async (
  workspace: WorkspaceType,
  t: Transaction
) => {
  const conversations = await Conversation.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });
  const chunkSize = 8;
  const chunks = [];
  for (let i = 0; i < conversations.length; i += chunkSize) {
    chunks.push(conversations.slice(i, i + chunkSize));
  }
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }
    await Promise.all(
      chunk.map((c) => {
        return (async () => {
          const messages = await Message.findAll({
            where: { conversationId: c.id },
            transaction: t,
          });
          for (const msg of messages) {
            if (msg.userMessageId) {
              await UserMessage.destroy({
                where: { id: msg.userMessageId },
                transaction: t,
              });
            }
            if (msg.agentMessageId) {
              const agentMessage = await AgentMessage.findOne({
                where: { id: msg.agentMessageId },
                transaction: t,
              });
              if (agentMessage) {
                if (agentMessage.agentRetrievalActionId) {
                  const retrievalDocuments = await RetrievalDocument.findAll({
                    where: {
                      retrievalActionId: agentMessage.agentRetrievalActionId,
                    },
                    transaction: t,
                  });
                  for (const retrievalDocument of retrievalDocuments) {
                    await RetrievalDocumentChunk.destroy({
                      where: {
                        retrievalDocumentId: retrievalDocument.id,
                      },
                      transaction: t,
                    });
                    await retrievalDocument.destroy({ transaction: t });
                  }
                  await AgentRetrievalAction.destroy({
                    where: { id: agentMessage.agentRetrievalActionId },
                    transaction: t,
                  });
                }
                await agentMessage.destroy({ transaction: t });
              }
            }
            if (msg.contentFragmentId) {
              await ContentFragment.destroy({
                where: { id: msg.contentFragmentId },
                transaction: t,
              });
            }
            await MessageReaction.destroy({
              where: { messageId: msg.id },
              transaction: t,
            });
            await Mention.destroy({
              where: { messageId: msg.id },
              transaction: t,
            });
            await msg.destroy({ transaction: t });
          }
          await ConversationParticipant.destroy({
            where: { conversationId: c.id },
            transaction: t,
          });
          await c.destroy({ transaction: t });
        })();
      })
    );
  }
};

const _deleteAgents = async (workspace: WorkspaceType, t: Transaction) => {
  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });
  for (const agent of agents) {
    if (agent.generationConfigurationId) {
      await AgentGenerationConfiguration.destroy({
        where: {
          id: agent.generationConfigurationId,
        },
        transaction: t,
      });
    } else if (agent.retrievalConfigurationId) {
      await AgentDataSourceConfiguration.destroy({
        where: {
          retrievalConfigurationId: agent.retrievalConfigurationId,
        },
        transaction: t,
      });
      await AgentRetrievalConfiguration.destroy({
        where: {
          id: agent.retrievalConfigurationId,
        },
        transaction: t,
      });
    } else if (agent.dustAppRunConfigurationId) {
      await AgentDustAppRunAction.destroy({
        where: {
          dustAppRunConfigurationId: agent.dustAppRunConfigurationId,
        },
        transaction: t,
      });
      await AgentDustAppRunConfiguration.destroy({
        where: {
          id: agent.dustAppRunConfigurationId,
        },
        transaction: t,
      });
    }
    await AgentUserRelation.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
      transaction: t,
    });
    await agent.destroy({ transaction: t });
  }
  await GlobalAgentSettings.destroy({
    where: {
      workspaceId: workspace.id,
    },
    transaction: t,
  });
};

const _deleteApps = async (workspace: WorkspaceType, t: Transaction) => {
  const apps = await App.findAll({
    where: { workspaceId: workspace.id },
    transaction: t,
  });
  for (const app of apps) {
    await Run.destroy({
      where: {
        appId: app.id,
      },
      transaction: t,
    });
    await Clone.destroy({
      where: {
        [Op.or]: [{ fromId: app.id }, { toId: app.id }],
      },
      transaction: t,
    });
    await Dataset.destroy({
      where: {
        appId: app.id,
      },
      transaction: t,
    });
    await app.destroy({ transaction: t });
  }
  await Key.destroy({
    where: {
      workspaceId: workspace.id,
    },
    transaction: t,
  });
  await Provider.destroy({
    where: {
      workspaceId: workspace.id,
    },
    transaction: t,
  });
};

const _deleteInvitations = async (workspace: WorkspaceType, t: Transaction) => {
  await MembershipInvitation.destroy({
    where: {
      workspaceId: workspace.id,
    },
    transaction: t,
  });
};

const _deleteMembershipsAndUserIfOneOnly = async (
  workspace: WorkspaceType,
  t: Transaction
) => {
  const memberships = await Membership.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  if (memberships.length === 1) {
    // We also delete the user if it has no other workspace.
    const membership = memberships[0];
    const membershipsOfUser = await Membership.findAll({
      where: {
        userId: membership.userId,
      },
    });
    if (membershipsOfUser.length === 1) {
      const user = await User.findOne({
        where: {
          id: membership.userId,
        },
      });
      if (user) {
        await UserMetadata.destroy({
          where: {
            userId: user.id,
          },
          transaction: t,
        });
        await membership.destroy({ transaction: t });
        await user.destroy({ transaction: t });
      }
    }
  }

  for (const membership of memberships) {
    await membership.destroy({ transaction: t });
  }
};

const _deleteWorkspace = async (workspace: WorkspaceType, t: Transaction) => {
  await Subscription.destroy({
    where: {
      workspaceId: workspace.id,
    },
    transaction: t,
  });
  await PlanInvitation.destroy({
    where: {
      workspaceId: workspace.id,
    },
    transaction: t,
  });
  await Workspace.destroy({
    where: {
      id: workspace.id,
    },
    transaction: t,
  });
};
