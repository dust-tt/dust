import assert from "assert";
import { Op } from "sequelize";

import { hardDeleteApp } from "@app/lib/api/apps";
import config from "@app/lib/api/config";
import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import { hardDeleteSpace } from "@app/lib/api/spaces";
import { deleteWorksOSOrganizationWithWorkspace } from "@app/lib/api/workos/organization";
import { areAllSubscriptionsCanceled } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import {
  AgentConfiguration,
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/assistant/agent";
import { AgentDataRetentionModel } from "@app/lib/models/assistant/agent_data_retention";
import { TagAgentModel } from "@app/lib/models/assistant/tag_agent";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { Subscription } from "@app/lib/models/plan";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { Provider } from "@app/lib/resources/storage/models/apps";
import {
  LabsTranscriptsConfigurationModel,
  LabsTranscriptsHistoryModel,
} from "@app/lib/resources/storage/models/labs_transcripts";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { deleteAllConversations } from "@app/temporal/scrub_workspace/activities";
import { CoreAPI } from "@app/types";

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

export async function scrubMCPServerViewActivity({
  mcpServerViewId,
  workspaceId,
}: {
  mcpServerViewId: string;
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const mcpServerView = await MCPServerViewResource.fetchById(
    auth,
    mcpServerViewId,
    {
      includeDeleted: true,
    }
  );
  if (!mcpServerView) {
    throw new Error("MCPServerView not found.");
  }
  await mcpServerView.delete(auth, { hardDelete: true });
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

  // Delete all the mcp server views of the space.
  const mcpServerViews = await MCPServerViewResource.listBySpace(auth, space, {
    includeDeleted: true,
  });
  for (const mcpServerView of mcpServerViews) {
    await scrubMCPServerViewActivity({
      mcpServerViewId: mcpServerView.sId,
      workspaceId,
    });
  }
  hardDeleteLogger.info({ space: space.sId, workspaceId }, "Deleting space");

  await hardDeleteSpace(auth, space);
}

export async function isWorkflowDeletableActivity({
  workspaceId,
  workspaceHasBeenRelocated = false,
}: {
  workspaceId: string;
  workspaceHasBeenRelocated?: boolean;
}) {
  // If the workspace has been relocated, we don't expect subscriptions to be canceled.
  if (workspaceHasBeenRelocated) {
    return true;
  }

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
    const mcpServerConfigurations = await AgentMCPServerConfiguration.findAll({
      where: {
        agentConfigurationId: agent.id,
        workspaceId: workspace.id,
      },
    });
    await AgentDataSourceConfiguration.destroy({
      where: {
        mcpServerConfigurationId: {
          [Op.in]: mcpServerConfigurations.map((r) => r.id),
        },
      },
    });
    await AgentTablesQueryConfigurationTable.destroy({
      where: {
        mcpServerConfigurationId: {
          [Op.in]: mcpServerConfigurations.map((r) => r.id),
        },
      },
    });

    await AgentReasoningConfiguration.destroy({
      where: {
        mcpServerConfigurationId: {
          [Op.in]: mcpServerConfigurations.map((r) => r.id),
        },
      },
    });

    await AgentChildAgentConfiguration.destroy({
      where: {
        mcpServerConfigurationId: {
          [Op.in]: mcpServerConfigurations.map((r) => `${r.id}`),
        },
        workspaceId: workspace.id,
      },
    });
    await AgentMCPServerConfiguration.destroy({
      where: {
        agentConfigurationId: agent.id,
        workspaceId: workspace.id,
      },
    });

    await AgentUserRelation.destroy({
      where: {
        agentConfiguration: agent.sId,
      },
    });

    await TagAgentModel.destroy({
      where: {
        agentConfigurationId: agent.id,
        workspaceId: workspace.id,
      },
    });

    await AgentMemoryModel.destroy({
      where: {
        agentConfigurationId: agent.sId,
        workspaceId: workspace.id,
      },
    });

    const group = await GroupResource.fetchByAgentConfiguration({
      auth,
      agentConfiguration: agent,
      isDeletionFlow: true,
    });
    if (group) {
      await group.delete(auth);
    }

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

  await KeyResource.deleteAllForWorkspace(auth);

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

  const localLogger = hardDeleteLogger.child({ workspaceId });

  const BATCH_SIZE = 10_000;
  let deletedRuns = 0;

  // Fetch the total of runs to fetch to max end to not go over.
  const totalRunsToFetch = await RunResource.countByWorkspace(workspace);
  localLogger.info(
    { totalRuns: totalRunsToFetch },
    "Numbers of runs to be deleted"
  );

  do {
    const runs = await RunResource.listByWorkspace(workspace, {
      includeApp: true,
      limit: BATCH_SIZE,
      order: [["createdAt", "ASC"]],
    });

    localLogger.info(
      { batchSize: runs.length, deletedRuns },
      "Processing batch of runs"
    );

    await concurrentExecutor(
      runs,
      async (run, idx) => {
        const res = await coreAPI.deleteRun({
          projectId: run.app.dustAPIProjectId,
          runId: run.dustRunId,
        });
        if (res.isErr()) {
          throw new Error(`Error deleting Run from Core: ${res.error.message}`);
        }
        await run.delete(auth);

        if (idx % 500) {
          localLogger.info({ idx, runId: run.id }, "Run deleted");
        }
      },
      { concurrency: 12 }
    );

    localLogger.info(
      { deletedRuns, batchRunsDeleted: runs.length },
      "Processed batch of runs"
    );

    // The last fetch was less than the batch size, so we know there is no batch after that.
    if (runs.length < BATCH_SIZE) {
      localLogger.info(
        "Exiting the loop as there is less runs than the batch size"
      );
      break;
    }
    deletedRuns += runs.length;
  } while (deletedRuns <= totalRunsToFetch);
}

export const deleteRemoteMCPServersActivity = async ({
  workspaceId,
}: {
  workspaceId: string;
}) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  await MCPServerConnectionResource.deleteAllForWorkspace(auth);

  const remoteMCPServers = await RemoteMCPServerResource.listByWorkspace(auth);
  for (const remoteMCPServer of remoteMCPServers) {
    await remoteMCPServer.delete(auth);
  }
};

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
  const workspace = auth.getNonNullableWorkspace();

  const childLogger = hardDeleteLogger.child({
    workspaceId: workspace.id,
  });

  await MembershipInvitationModel.destroy({
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
        childLogger.info(
          {
            membershipId: membership.id,
            userId: user.sId,
          },
          "Deleting Membership and user"
        );

        // Delete the user's files.
        await FileResource.deleteAllForUser(auth, user.toJSON());
        await membership.delete(auth, {});

        // Delete the user's agent memories.
        await AgentMemoryModel.destroy({
          where: {
            userId: user.id,
          },
        });

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

  // We need to delete global and system spaces last, as some resources rely on them.
  const sortedSpaces = spaces.sort((a, b) => {
    // First sort by space kind priority (system last, then global, then others).
    const getSpacePriority = (space: SpaceResource) => {
      if (space.kind === "system") {
        return 2;
      }
      if (space.kind === "global") {
        return 1;
      }
      return 0;
    };

    const priorityDiff = getSpacePriority(a) - getSpacePriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    // Then sort by creation time for spaces of the same priority.
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  for (const space of sortedSpaces) {
    const res = await space.delete(auth, { hardDelete: false });
    if (res.isErr()) {
      throw res.error;
    }

    // Soft delete all the data source views of the space.
    const dataSourceViews = await DataSourceViewResource.listBySpace(
      auth,
      space,
      { includeDeleted: true }
    );
    for (const ds of dataSourceViews) {
      await ds.delete(auth, { hardDelete: false });
    }

    // Soft delete all the data sources of the space.
    const dataSources = await DataSourceResource.listBySpace(auth, space, {
      includeDeleted: true,
    });
    for (const ds of dataSources) {
      await ds.delete(auth, { hardDelete: false });
    }

    // Soft delete all the mcp server views of the space.
    const mcpServerViews = await MCPServerViewResource.listBySpace(
      auth,
      space,
      {
        includeDeleted: true,
      }
    );
    for (const mcpServerView of mcpServerViews) {
      await mcpServerView.delete(auth, { hardDelete: false });
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
  await TriggerResource.deleteAllForWorkspace(auth);
  await FileResource.deleteAllForWorkspace(auth);
  await RunResource.deleteAllForWorkspace(auth);
  await MembershipResource.deleteAllForWorkspace(auth);
  await WorkspaceHasDomainModel.destroy({
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
  await AgentMemoryResource.deleteAllForWorkspace(auth);

  hardDeleteLogger.info({ workspaceId }, "Deleting Workspace");

  await WorkspaceModel.destroy({
    where: {
      id: workspace.id,
    },
  });
  await AgentDataRetentionModel.destroy({
    where: { workspaceId: workspace.id },
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

export async function deleteTagsActivity({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const tags = await TagResource.findAll(auth);
  for (const tag of tags) {
    await tag.delete(auth);
  }
}

export async function deleteWorkOSOrganization({
  workspaceHasBeenRelocated = false,
  workspaceId,
}: {
  workspaceHasBeenRelocated?: boolean;
  workspaceId: string;
}) {
  if (workspaceHasBeenRelocated) {
    logger.info(
      { workspaceId },
      "Skipping WorkOS organization deletion for workspace that has been relocated."
    );

    return;
  }

  await deleteWorksOSOrganizationWithWorkspace(workspaceId);
}
