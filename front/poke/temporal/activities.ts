import { CoreAPI } from "@dust-tt/types";
import assert from "assert";
import { chunk } from "lodash";
import { Op } from "sequelize";

import { hardDeleteApp } from "@app/lib/api/apps";
import config from "@app/lib/api/config";
import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import { hardDeleteSpace } from "@app/lib/api/spaces";
import { areAllSubscriptionsCanceled } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  AgentBrowseAction,
  AgentBrowseConfiguration,
} from "@app/lib/models/assistant/actions/browse";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
} from "@app/lib/models/assistant/actions/dust_app_run";
import {
  AgentProcessAction,
  AgentProcessConfiguration,
} from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryAction,
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import {
  AgentWebsearchAction,
  AgentWebsearchConfiguration,
} from "@app/lib/models/assistant/actions/websearch";
import {
  AgentConfiguration,
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/assistant/agent";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { MembershipInvitation } from "@app/lib/models/membership_invitation";
import { Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomain } from "@app/lib/models/workspace_has_domain";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { FileResource } from "@app/lib/resources/file_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { Provider } from "@app/lib/resources/storage/models/apps";
import {
  LabsTranscriptsConfigurationModel,
  LabsTranscriptsHistoryModel,
} from "@app/lib/resources/storage/models/labs_transcripts";
import { PlatformActionsConfigurationModel } from "@app/lib/resources/storage/models/platform_actions";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { deleteAllConversations } from "@app/temporal/scrub_workspace/activities";

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

  await hardDeleteDataSource(auth, dataSource);
}

export async function scrubSpaceActivity({
  spaceId,
  workspaceId,
}: {
  spaceId: string;
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const space = await SpaceResource.fetchById(auth, spaceId, {
    includeDeleted: true,
  });

  if (!space) {
    throw new Error("Space not found.");
  }

  assert(space.isDeletable(), "Space cannot be deleted.");

  // Delete all the data sources of the spaces.
  const dataSources = await DataSourceResource.listBySpace(auth, space, {
    includeDeleted: true,
  });
  for (const ds of dataSources) {
    await scrubDataSourceActivity({
      dataSourceId: ds.sId,
      workspaceId,
    });
  }

  hardDeleteLogger.info({ space: space.sId, workspaceId }, "Deleting space");

  await hardDeleteSpace(auth, space);
}

export async function isWorkflowDeletableActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  return areAllSubscriptionsCanceled(renderLightWorkspaceType({ workspace }));
}

export async function deleteConversationsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
  await deleteAllConversations(auth);
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

  await GlobalAgentSettings.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });
  for (const agent of agents) {
    const retrievalConfigurations = await AgentRetrievalConfiguration.findAll({
      where: {
        agentConfigurationId: agent.id,
      },
    });
    await AgentDataSourceConfiguration.destroy({
      where: {
        retrievalConfigurationId: {
          [Op.in]: retrievalConfigurations.map((r) => r.id),
        },
      },
    });
    await AgentRetrievalConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
    });

    const dustAppRunConfigurations = await AgentDustAppRunConfiguration.findAll(
      {
        where: {
          agentConfigurationId: agent.id,
        },
      }
    );
    await AgentDustAppRunAction.destroy({
      where: {
        dustAppRunConfigurationId: {
          [Op.in]: dustAppRunConfigurations.map((r) => r.sId),
        },
      },
    });
    await AgentDustAppRunConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
    });

    const tablesQueryConfigurations =
      await AgentTablesQueryConfiguration.findAll({
        where: {
          agentConfigurationId: agent.id,
        },
      });
    await AgentTablesQueryAction.destroy({
      where: {
        tablesQueryConfigurationId: {
          [Op.in]: tablesQueryConfigurations.map((r) => r.sId),
        },
      },
    });
    await AgentTablesQueryConfigurationTable.destroy({
      where: {
        tablesQueryConfigurationId: {
          [Op.in]: tablesQueryConfigurations.map((r) => r.id),
        },
      },
    });
    await AgentTablesQueryConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
    });

    const agentBrowseConfigurations = await AgentBrowseConfiguration.findAll({
      where: {
        agentConfigurationId: agent.id,
      },
    });
    await AgentBrowseAction.destroy({
      where: {
        browseConfigurationId: {
          [Op.in]: agentBrowseConfigurations.map((r) => r.sId),
        },
      },
    });
    await AgentBrowseConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
    });

    const agentWebsearchConfigurations =
      await AgentWebsearchConfiguration.findAll({
        where: {
          agentConfigurationId: agent.id,
        },
      });
    await AgentWebsearchAction.destroy({
      where: {
        websearchConfigurationId: {
          [Op.in]: agentWebsearchConfigurations.map((r) => r.sId),
        },
      },
    });
    await AgentWebsearchConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
    });

    const agentProcessConfigurations = await AgentProcessConfiguration.findAll({
      where: {
        agentConfigurationId: agent.id,
      },
    });
    await AgentProcessAction.destroy({
      where: {
        processConfigurationId: {
          [Op.in]: agentProcessConfigurations.map((r) => r.sId),
        },
      },
    });
    await AgentProcessConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
      },
    });

    await AgentUserRelation.destroy({
      where: {
        agentConfiguration: agent.sId,
      },
    });
    hardDeleteLogger.info({ agentId: agent.sId }, "Deleting agent");
    await agent.destroy();
  }
}

export async function deleteAppsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  const apps = await AppResource.listByWorkspace(auth, {
    includeDeleted: true,
  });

  for (const app of apps) {
    const res = await hardDeleteApp(auth, app);
    if (res.isErr()) {
      throw res.error;
    }
  }

  await KeyResource.deleteAllForWorkspace(workspace);

  await Provider.destroy({
    where: {
      workspaceId: workspace.id,
    },
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

export const deleteTrackersActivity = async ({
  workspaceId,
}: {
  workspaceId: string;
}) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const trackers = await TrackerConfigurationResource.listByWorkspace(auth, {
    includeDeleted: true,
  });

  for (const tracker of trackers) {
    await tracker.delete(auth, { hardDelete: true });
  }
};

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

  await MembershipInvitation.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });

  const { memberships } = await MembershipResource.getMembershipsForWorkspace({
    workspace,
  });

  for (const membership of memberships) {
    const user = await UserResource.fetchByModelId(membership.userId);
    if (user) {
      const { memberships: membershipsOfUser } =
        await MembershipResource.getLatestMemberships({
          users: [user],
        });

      // If the user we're removing the membership of only has one membership, we delete the user.
      if (membershipsOfUser.length === 1) {
        hardDeleteLogger.info(
          {
            membershipId: membership.id,
            userId: user.sId,
          },
          "Deleting Membership and user"
        );

        // Delete the user's files.
        await FileResource.deleteAllForUser(user.toJSON());
        await membership.delete(auth, {});
        await user.delete(auth, {});
      }
    } else {
      hardDeleteLogger.info(
        {
          membershipId: membership.id,
        },
        "Deleting Membership"
      );
      await membership.delete(auth, {});
    }
  }
}

export async function deleteSpacesActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeConversationsSpace: true,
    includeDeleted: true,
  });

  for (const space of spaces) {
    const res = await space.delete(auth, { hardDelete: false });
    if (res.isErr()) {
      throw res.error;
    }

    await scrubSpaceActivity({
      spaceId: space.sId,
      workspaceId,
    });
  }
}

export async function deletePluginRunsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  await PluginRunResource.deleteAllForWorkspace(auth);
}

export async function deleteWorkspaceActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  await Subscription.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });
  await FileResource.deleteAllForWorkspace(workspace);
  await RunResource.deleteAllForWorkspace(workspace);
  await MembershipResource.deleteAllForWorkspace(workspace);
  await WorkspaceHasDomain.destroy({
    where: { workspaceId: workspace.id },
  });
  await AgentUserRelation.destroy({
    where: { workspaceId: workspace.id },
  });
  await ExtensionConfigurationResource.deleteForWorkspace(auth, {});
  await DustAppSecret.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });
  await FeatureFlag.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });
  await PlatformActionsConfigurationModel.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });

  hardDeleteLogger.info({ workspaceId }, "Deleting Workspace");

  await Workspace.destroy({
    where: {
      id: workspace.id,
    },
  });
}

export async function deleteTranscriptsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  const configs = await LabsTranscriptsConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  await LabsTranscriptsHistoryModel.destroy({
    where: {
      configurationId: {
        [Op.in]: configs.map((c) => c.id),
      },
    },
  });

  await LabsTranscriptsConfigurationModel.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });
}
