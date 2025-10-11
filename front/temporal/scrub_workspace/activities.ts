import _ from "lodash";

import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import config from "@app/lib/api/config";
import {
  getDataSources,
  softDeleteDataSourceAndLaunchScrubWorkflow,
} from "@app/lib/api/data_sources";
import { sendAdminDataDeletionEmail } from "@app/lib/api/email";
import { softDeleteSpaceAndLaunchScrubWorkflow } from "@app/lib/api/spaces";
import {
  getMembers,
  getWorkspaceInfos,
  unsafeGetWorkspacesByModelId,
} from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  FREE_NO_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { ConnectorsAPI, isGlobalAgentId, removeNulls } from "@app/types";

export async function sendDataDeletionEmail({
  remainingDays,
  workspaceId,
  isLast,
}: {
  remainingDays: number;
  workspaceId: string;
  isLast: boolean;
}) {
  try {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const ws = auth.workspace();
    if (!ws) {
      throw new Error("No workspace found");
    }
    const { members: admins } = await getMembers(auth, {
      roles: ["admin"],
      activeOnly: true,
    });
    for (const a of admins) {
      await sendAdminDataDeletionEmail({
        email: a.email,
        workspaceName: ws.name,
        remainingDays,
        isLast,
      });
    }
  } catch (e) {
    logger.error(
      { panic: true, error: e },
      "Failed to send data deletion email"
    );
    throw e;
  }
}

export async function shouldStillScrubData({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  const workspace = await getWorkspaceInfos(workspaceId);
  if (!workspace) {
    return false;
  }
  return !(
    await Authenticator.internalAdminForWorkspace(workspaceId)
  ).isUpgraded();
}

export async function scrubWorkspaceData({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
  await deleteAllConversations(auth);
  await archiveAssistants(auth);
  await deleteAgentMemories(auth);
  await deleteTags(auth);
  await deleteTrackers(auth);
  await deleteDatasources(auth);
  await deleteSpaces(auth);
  await cleanupCustomerio(auth);
}

export async function pauseAllConnectors({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const dataSources = await getDataSources(auth);
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  for (const ds of dataSources) {
    if (!ds.connectorId) {
      continue;
    }
    await connectorsAPI.pauseConnector(ds.connectorId);
  }
}

export async function pauseAllTriggers({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const disableResult = await TriggerResource.disableAllForWorkspace(auth);
  if (disableResult.isErr()) {
    // Don't fail the whole scrub workflow if we can't disable triggers, just log it.
    logger.error(
      { workspaceId, error: disableResult.error },
      "Failed to disable workspace triggers during scrub"
    );
  }
}

export async function deleteAllConversations(auth: Authenticator) {
  const workspace = auth.getNonNullableWorkspace();
  const conversations = await ConversationResource.listAll(auth, {
    includeDeleted: true,
    includeTest: true,
  });
  logger.info(
    { workspaceId: workspace.sId, conversationsCount: conversations.length },
    "Deleting all conversations for workspace."
  );
  // unique conversations
  const uniqueConversations = _.uniqBy(conversations, (c) => c.sId);
  await concurrentExecutor(
    uniqueConversations,
    async (conversation) => {
      const result = await destroyConversation(auth, {
        conversationId: conversation.sId,
      });
      if (result.isErr()) {
        if (result.error.type === "conversation_not_found") {
          logger.warn(
            {
              workspaceId: workspace.sId,
              conversationId: conversation.sId,
              error: result.error,
            },
            "Attempting to delete a non-existing conversation."
          );
          return;
        }
        throw result.error;
      }
    },
    {
      concurrency: 16,
    }
  );
}

async function archiveAssistants(auth: Authenticator) {
  const agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "admin_internal",
    variant: "light",
  });

  const agentConfigurationsToArchive = agentConfigurations.filter(
    (ac) => !isGlobalAgentId(ac.sId)
  );
  for (const agentConfiguration of agentConfigurationsToArchive) {
    await archiveAgentConfiguration(auth, agentConfiguration.sId);
  }
}

async function deleteAgentMemories(auth: Authenticator) {
  await AgentMemoryResource.deleteAllForWorkspace(auth);
}

async function deleteTags(auth: Authenticator) {
  const tags = await TagResource.findAll(auth);
  for (const tag of tags) {
    await tag.delete(auth);
  }
}

async function deleteTrackers(auth: Authenticator) {
  const workspace = auth.workspace();
  if (!workspace) {
    throw new Error("No workspace found");
  }

  const trackers = await TrackerConfigurationResource.listByWorkspace(auth, {
    includeDeleted: true,
  });
  for (const tracker of trackers) {
    await tracker.delete(auth, { hardDelete: true });
  }
}

async function deleteDatasources(auth: Authenticator) {
  const globalAndSystemSpaces = await SpaceResource.listWorkspaceDefaultSpaces(
    auth,
    { includeConversationsSpace: true }
  );

  // Retrieve and delete all data sources associated with the system and global spaces.
  // Others will be deleted when deleting the spaces.
  const dataSources = await DataSourceResource.listBySpaces(
    auth,
    globalAndSystemSpaces
  );

  for (const ds of dataSources) {
    // Perform a soft delete and initiate a workflow for permanent deletion of the data source.
    const r = await softDeleteDataSourceAndLaunchScrubWorkflow(auth, ds);
    if (r.isErr()) {
      throw new Error(`Failed to delete data source: ${r.error.message}`);
    }
  }
}

// Remove all user-created spaces and their associated groups,
// preserving only the system and global spaces.
async function deleteSpaces(auth: Authenticator) {
  const spaces = await SpaceResource.listWorkspaceSpaces(auth);

  // Filter out system and global spaces.
  const filteredSpaces = spaces.filter(
    (space) => !space.isGlobal() && !space.isSystem()
  );

  for (const space of filteredSpaces) {
    await softDeleteSpaceAndLaunchScrubWorkflow(auth, space);
  }
}

async function cleanupCustomerio(auth: Authenticator) {
  const w = auth.workspace();

  if (!w) {
    throw new Error("No workspace found");
  }

  // Fetch all the memberships for the workspace.
  const { memberships: workspaceMemberships } =
    await MembershipResource.getLatestMemberships({
      workspace: w,
    });

  // Fetch all the users in the workspace.
  const userIds = workspaceMemberships.map((m) => m.userId);
  const users = await UserResource.fetchByModelIds(userIds);

  // For each user, fetch all their memberships.
  let latestMemberships: MembershipResource[] = [];
  if (userIds.length) {
    const { memberships } = await MembershipResource.getLatestMemberships({
      users,
    });
    latestMemberships = memberships;
  }

  const allMembershipsByUserId = _.groupBy(latestMemberships, (m) =>
    m.userId.toString()
  );

  // For every membership, fetch the workspace.
  const workspaceIds = Object.values(allMembershipsByUserId)
    .flat()
    .map((m) => m.workspaceId);
  const workspaceById = _.keyBy(
    await unsafeGetWorkspacesByModelId(workspaceIds),
    (w) => w.id.toString()
  );

  // Finally, fetch all the subscriptions for the workspaces.
  const subscriptionsByWorkspaceSid =
    await SubscriptionResource.fetchActiveByWorkspaces(
      Object.values(workspaceById)
    );

  // Process the workspace users in chunks of 4.
  const chunks = _.chunk(users, 4);

  for (const c of chunks) {
    await Promise.all(
      c.map((u) => {
        // Get all the memberships of the user.
        const allMembershipsOfUser =
          allMembershipsByUserId[u.id.toString()] ?? [];
        // Get all the workspaces of the user.
        const workspacesOfUser = removeNulls(
          allMembershipsOfUser.map(
            (m) => workspaceById[m.workspaceId.toString()]
          )
        );
        if (
          workspacesOfUser.some((w) => {
            const subscription = subscriptionsByWorkspaceSid[w.sId];
            return (
              subscription &&
              ![FREE_TEST_PLAN_CODE, FREE_NO_PLAN_CODE].includes(
                subscription.getPlan().code
              )
            );
          })
        ) {
          // If any of the workspaces has a real subscription, do not delete the user.
          return;
        }

        // Delete the user from Customer.io.
        logger.info(
          { userId: u.sId },
          "User is not tied to a workspace with a real subscription anymore, deleting from Customer.io."
        );

        return CustomerioServerSideTracking.deleteUser({
          user: u.toJSON(),
        }).catch((err) => {
          logger.error(
            { userId: u.sId, err },
            "Failed to delete user on Customer.io"
          );
        });
      })
    );
  }

  await CustomerioServerSideTracking.deleteWorkspace({
    workspace: renderLightWorkspaceType({ workspace: w }),
  }).catch((err) => {
    logger.error(
      { workspaceId: w.sId, err },
      "Failed to delete workspace on Customer.io"
    );
  });
}

export async function endSubscriptionFreeEndedWorkspacesActivity(): Promise<{
  workspaceIds: string[];
}> {
  const { workspaces } =
    await SubscriptionResource.internalFetchWorkspacesWithFreeEndedSubscriptions();

  await concurrentExecutor(
    workspaces,
    async (workspace) => {
      await SubscriptionResource.endActiveSubscription(workspace);
    },
    {
      concurrency: 4,
    }
  );

  return {
    workspaceIds: workspaces.map((w) => w.sId),
  };
}
