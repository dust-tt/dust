import { CoreAPI } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import { Op } from "sequelize";

import { renderUserType } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import { App, Clone, Dataset, Provider, Run } from "@app/lib/models/apps";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
} from "@app/lib/models/assistant/actions/dust_app_run";
import {
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentConfiguration,
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/assistant/agent";
import {
  AgentMessage,
  Conversation,
  ConversationParticipant,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { DataSource } from "@app/lib/models/data_source";
import { Subscription } from "@app/lib/models/plan";
import { User, UserMetadata } from "@app/lib/models/user";
import {
  Key,
  MembershipInvitation,
  Workspace,
} from "@app/lib/models/workspace";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";

const { DUST_DATA_SOURCES_BUCKET, SERVICE_ACCOUNT } = process.env;

export async function scrubDataSourceActivity({
  dustAPIProjectId,
}: {
  dustAPIProjectId: string;
}) {
  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT is not set.");
  }
  if (!DUST_DATA_SOURCES_BUCKET) {
    throw new Error("DUST_DATA_SOURCES_BUCKET is not set.");
  }

  const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });

  const [files] = await storage
    .bucket(DUST_DATA_SOURCES_BUCKET)
    .getFiles({ prefix: dustAPIProjectId });

  const chunkSize = 32;
  const chunks = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }
    await Promise.all(
      chunk.map((f) => {
        return (async () => {
          await f.delete();
        })();
      })
    );
  }
}

export async function isWorkflowDeletableActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();
  if (!workspace) {
    return false;
  }

  // Workspace must have no data sources.
  const dataSources = await DataSource.findAll({
    where: {
      workspaceId: workspace.id,
    },
    limit: 1,
  });
  if (dataSources.length > 0) {
    return false;
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
  return subscriptions.length === 0;
}

export async function deleteConversationsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  const conversations = await Conversation.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });
  const chunkSize = 8;
  const chunks: Conversation[][] = [];
  for (let i = 0; i < conversations.length; i += chunkSize) {
    chunks.push(conversations.slice(i, i + chunkSize));
  }

  await frontSequelize.transaction(async (t) => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }
      await Promise.all(
        chunk.map((c) => {
          return (async (): Promise<void> => {
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
                  const retrievalAction = await AgentRetrievalAction.findOne({
                    where: {
                      agentMessageId: agentMessage.id,
                    },
                  });
                  if (retrievalAction) {
                    const retrievalDocuments = await RetrievalDocument.findAll({
                      where: {
                        retrievalActionId: retrievalAction.id,
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
                      where: { id: retrievalAction.id },
                      transaction: t,
                    });
                  }
                  await agentMessage.destroy({ transaction: t });
                }
              }
              if (msg.contentFragmentId) {
                const contentFragment = await ContentFragmentResource.fetchById(
                  msg.contentFragmentId,
                  t
                );
                if (contentFragment) {
                  await contentFragment.delete(t);
                }
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
            logger.info(`[Workspace delete] Deleting conversation ${c.sId}`);
            await c.destroy({ transaction: t });
          })();
        })
      );
    }
  });
}

export async function deleteAgentsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  await frontSequelize.transaction(async (t) => {
    await GlobalAgentSettings.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction: t,
    });
    for (const agent of agents) {
      const retrievalConfigurations = await AgentRetrievalConfiguration.findAll(
        {
          where: {
            agentConfigurationId: agent.id,
          },
          transaction: t,
        }
      );
      await AgentDataSourceConfiguration.destroy({
        where: {
          retrievalConfigurationId: {
            [Op.in]: retrievalConfigurations.map((r) => r.id),
          },
        },
        transaction: t,
      });
      await AgentRetrievalConfiguration.destroy({
        where: {
          agentConfigurationId: agent.id,
        },
        transaction: t,
      });
      const dustAppRunConfigurations =
        await AgentDustAppRunConfiguration.findAll({
          where: {
            agentConfigurationId: agent.id,
          },
          transaction: t,
        });
      await AgentDustAppRunAction.destroy({
        where: {
          dustAppRunConfigurationId: {
            [Op.in]: dustAppRunConfigurations.map((r) => r.sId),
          },
        },
        transaction: t,
      });
      await AgentDustAppRunConfiguration.destroy({
        where: {
          agentConfigurationId: agent.id,
        },
        transaction: t,
      });
      // TODO(@fontanierh): missing tables query here.
      await AgentUserRelation.destroy({
        where: {
          agentConfiguration: agent.sId,
        },
        transaction: t,
      });
      logger.info(`[Workspace delete] Deleting agent ${agent.sId}`);
      await agent.destroy({ transaction: t });
    }
  });
}

export async function deleteAppsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const coreAPI = new CoreAPI(logger);
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  const apps = await App.findAll({
    where: { workspaceId: workspace.id },
  });

  await frontSequelize.transaction(async (t) => {
    for (const app of apps) {
      const res = await coreAPI.deleteProject({
        projectId: app.dustAPIProjectId,
      });
      if (res.isErr()) {
        throw new Error(
          `Error deleting Project from Core: ${res.error.message}`
        );
      }
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
      logger.info(`[Workspace delete] Deleting app ${app.sId}`);
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
  });
}

export async function deleteRunOnDustAppsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const coreAPI = new CoreAPI(logger);
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  const runs = await Run.findAll({
    where: {
      workspaceId: workspace.id,
    },
    include: [
      {
        model: App,
        as: "app",
        required: true,
      },
    ],
  });

  const chunkSize = 8;
  const chunks: Run[][] = [];
  for (let i = 0; i < runs.length; i += chunkSize) {
    chunks.push(runs.slice(i, i + chunkSize));
  }

  await frontSequelize.transaction(async (t) => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }
      await Promise.all(
        chunk.map((run) => {
          return (async () => {
            const res = await coreAPI.deleteRun({
              projectId: run.app.dustAPIProjectId,
              runId: run.dustRunId,
            });
            if (res.isErr()) {
              throw new Error(
                `Error deleting Run from Core: ${res.error.message}`
              );
            }
            await run.destroy({ transaction: t });
          })();
        })
      );
    }
  });
}

export async function deleteMembersActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  await frontSequelize.transaction(async (t) => {
    await MembershipInvitation.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction: t,
    });

    const memberships = await MembershipResource.getLatestMemberships({
      workspace,
      transaction: t,
    });

    for (const membership of memberships) {
      const user = await User.findOne({
        where: {
          id: membership.userId,
        },
      });

      if (user) {
        const membershipsOfUser = await MembershipResource.getLatestMemberships(
          {
            users: [renderUserType(user)],
            transaction: t,
          }
        );

        // If the user we're removing the membership of only has one membership, we delete the user.
        if (membershipsOfUser.length === 1) {
          await UserMetadata.destroy({
            where: {
              userId: user.id,
            },
            transaction: t,
          });
          logger.info(
            `[Workspace delete] Deleting Membership ${membership.id} and user ${user.id}`
          );
          await membership.delete(t);
          await user.destroy({ transaction: t });
        }
      } else {
        logger.info(`[Workspace delete] Deleting Membership ${membership.id}`);
        await membership.delete(t);
      }
    }
  });
}

export async function deleteWorkspaceActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  await frontSequelize.transaction(async (t) => {
    await Subscription.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction: t,
    });
    logger.info(`[Workspace delete] Deleting Worskpace ${workspace.sId}`);
    await Workspace.destroy({
      where: {
        id: workspace.id,
      },
      transaction: t,
    });
  });
}
