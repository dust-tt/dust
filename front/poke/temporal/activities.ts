import { CoreAPI } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import assert from "assert";
import { chunk } from "lodash";
import { Op } from "sequelize";

import { hardDeleteApp } from "@app/lib/api/apps";
import config from "@app/lib/api/config";
import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import { hardDeleteVault } from "@app/lib/api/vaults";
import { areAllSubscriptionsCanceled } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
} from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import {
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
} from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryAction,
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentVisualizationAction } from "@app/lib/models/assistant/actions/visualization";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
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
import { Subscription } from "@app/lib/models/plan";
import { UserMetadata } from "@app/lib/models/user";
import { MembershipInvitation, Workspace } from "@app/lib/models/workspace";
import { AppResource } from "@app/lib/resources/app_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { RetrievalDocumentResource } from "@app/lib/resources/retrieval_document_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

const hardDeleteLogger = logger.child({ activity: "hard-delete" });

export async function scrubDataSourceActivity({
  dataSourceId,
  workspaceId,
}: {
  dataSourceId: string;
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId, {
    includeDeleted: true,
  });
  if (!dataSource) {
    hardDeleteLogger.info(
      { dataSource: { sId: dataSourceId } },
      "Data source not found."
    );

    throw new Error("Data source not found.");
  }

  // Ensure the data source has been soft deleted.
  if (!dataSource.deletedAt) {
    hardDeleteLogger.info(
      { dataSource: { sId: dataSourceId } },
      "Data source is not soft deleted."
    );
    throw new Error("Data source is not soft deleted.");
  }

  const { dustAPIProjectId } = dataSource;

  const storage = new Storage({ keyFilename: config.getServiceAccount() });

  const [files] = await storage
    .bucket(config.getDustDataSourcesBucket())
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

  await hardDeleteDataSource(auth, dataSource);
}

export async function scrubVaultActivity({
  vaultId,
  workspaceId,
}: {
  vaultId: string;
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const vault = await VaultResource.fetchById(auth, vaultId, {
    includeDeleted: true,
  });

  if (!vault) {
    throw new Error("Vault not found.");
  }

  const isDeletableVault =
    vault.isDeleted() || vault.isGlobal() || vault.isSystem();
  assert(isDeletableVault, "Vault is not soft deleted.");

  // Delete all the data sources of the vaults.
  const dataSources = await DataSourceResource.listByVault(auth, vault, {
    includeDeleted: true,
  });
  for (const ds of dataSources) {
    await scrubDataSourceActivity({
      dataSourceId: ds.sId,
      workspaceId,
    });
  }

  hardDeleteLogger.info({ vault: vault.sId }, "Deleting vault");

  await hardDeleteVault(auth, vault);
}

export async function isWorkflowDeletableActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = await auth.getNonNullableWorkspace();

  return areAllSubscriptionsCanceled(renderLightWorkspaceType({ workspace }));
}

export async function deleteConversationsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
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
                    transaction: t,
                  });
                  if (retrievalAction) {
                    await RetrievalDocumentResource.deleteAllForActions([
                      retrievalAction.id,
                    ]);

                    await AgentRetrievalAction.destroy({
                      where: { id: retrievalAction.id },
                      transaction: t,
                    });
                  }

                  // Delete associated actions.

                  await AgentBrowseAction.destroy({
                    where: { agentMessageId: agentMessage.id },
                    transaction: t,
                  });

                  await AgentProcessAction.destroy({
                    where: { agentMessageId: agentMessage.id },
                    transaction: t,
                  });

                  await AgentTablesQueryAction.destroy({
                    where: { agentMessageId: agentMessage.id },
                    transaction: t,
                  });

                  await AgentVisualizationAction.destroy({
                    where: { agentMessageId: agentMessage.id },
                    transaction: t,
                  });

                  await AgentWebsearchAction.destroy({
                    where: { agentMessageId: agentMessage.id },
                    transaction: t,
                  });

                  await agentMessage.destroy({ transaction: t });
                }
              }
              if (msg.contentFragmentId) {
                const contentFragment =
                  await ContentFragmentResource.fetchByModelId(
                    msg.contentFragmentId,
                    t
                  );
                if (contentFragment) {
                  await contentFragment.destroy(
                    {
                      conversationId: c.sId,
                      messageId: msg.sId,
                      workspaceId: workspace.sId,
                    },
                    t
                  );
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

            hardDeleteLogger.info(
              {
                conversationId: c.sId,
              },
              "Deleting conversation"
            );

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
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
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
      const tablesQueryConfigurations =
        await AgentTablesQueryConfiguration.findAll({
          where: {
            agentConfigurationId: agent.id,
          },
          transaction: t,
        });
      await AgentTablesQueryAction.destroy({
        where: {
          tablesQueryConfigurationId: {
            [Op.in]: tablesQueryConfigurations.map((r) => r.sId),
          },
        },
        transaction: t,
      });
      await AgentTablesQueryConfigurationTable.destroy({
        where: {
          tablesQueryConfigurationId: {
            [Op.in]: tablesQueryConfigurations.map((r) => r.id),
          },
        },
        transaction: t,
      });
      await AgentTablesQueryConfiguration.destroy({
        where: {
          agentConfigurationId: agent.id,
        },
        transaction: t,
      });
      await AgentUserRelation.destroy({
        where: {
          agentConfiguration: agent.sId,
        },
        transaction: t,
      });
      hardDeleteLogger.info({ agentId: agent.sId }, "Deleting agent");
      await agent.destroy({ transaction: t });
    }
  });
}

export async function deleteAppsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  const apps = await AppResource.listByWorkspace(auth);

  for (const app of apps) {
    const res = await hardDeleteApp(auth, app);
    if (res.isErr()) {
      throw res.error;
    }
  }

  await frontSequelize.transaction(async (t) => {
    await KeyResource.deleteAllForWorkspace(workspace, t);

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
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), hardDeleteLogger);
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    throw new Error("Could not find the workspace.");
  }

  const runs = await RunResource.listByWorkspace(workspace, {
    includeApp: true,
  });

  const chunkSize = 8;
  const chunks = chunk(runs, chunkSize);

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
          await run.delete(auth);
        })();
      })
    );
  }
}

export async function deleteMembersActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
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

    const { memberships } = await MembershipResource.getLatestMemberships({
      workspace,
      transaction: t,
    });

    for (const membership of memberships) {
      const user = await UserResource.fetchByModelId(membership.userId, t);
      if (user) {
        const { memberships: membershipsOfUser } =
          await MembershipResource.getLatestMemberships({
            users: [user],
            transaction: t,
          });

        // If the user we're removing the membership of only has one membership, we delete the user.
        if (membershipsOfUser.length === 1) {
          await UserMetadata.destroy({
            where: {
              userId: user.id,
            },
            transaction: t,
          });
          hardDeleteLogger.info(
            {
              membershipId: membership.id,
              userId: user.sId,
            },
            "Deleting Membership and user"
          );

          // Delete the user's files.
          await FileResource.deleteAllForUser(user.toJSON(), t);
          await membership.delete(auth, { transaction: t });
          await user.delete(auth, { transaction: t });
        }
      } else {
        hardDeleteLogger.info(
          {
            membershipId: membership.id,
          },
          "Deleting Membership"
        );
        await membership.delete(auth, { transaction: t });
      }
    }
  });
}

export async function deleteVaultsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const vaults = await VaultResource.listWorkspaceVaults(auth);

  for (const vault of vaults) {
    await scrubVaultActivity({
      vaultId: vault.sId,
      workspaceId,
    });
  }
}

export async function deleteWorkspaceActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  await frontSequelize.transaction(async (t) => {
    await Subscription.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction: t,
    });
    await FileResource.deleteAllForWorkspace(workspace, t);

    hardDeleteLogger.info({ workspaceId }, "Deleting Workspace");

    await Workspace.destroy({
      where: {
        id: workspace.id,
      },
      transaction: t,
    });
  });
}
