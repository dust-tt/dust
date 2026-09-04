import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import {
  createAndTrackMembership,
  revokeAndTrackMembership,
} from "@app/lib/api/membership";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { determineUserRoleFromGroups } from "@app/lib/api/user";
import { getWorkOS } from "@app/lib/api/workos/client";
import {
  getOrCreateWorkOSOrganization,
  getWorkOSOrganizationDSyncDirectories,
} from "@app/lib/api/workos/organization";
import {
  fetchOrCreateWorkOSUserWithEmail,
  fetchWorkOSUserWithEmail,
  getUserNicknameFromEmail,
} from "@app/lib/api/workos/user";
import {
  findWorkspaceByWorkOSOrganizationId,
  getWorkspaceInfos,
  isWorkspaceRelocationDone,
} from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { ExternalUser } from "@app/lib/iam/provider";
import type { CustomAttributeKey } from "@app/lib/iam/users";
import {
  CUSTOM_ATTRIBUTES_TO_SYNC,
  createOrUpdateUser,
  WORKOS_METADATA_KEY_PREFIX,
} from "@app/lib/iam/users";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import {
  ADMIN_GROUP_NAME,
  GROUP_MEMBERSHIP_RESTORE_TOLERANCE_MS,
  GroupResource,
  MANAGER_GROUP_NAME,
} from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { launchSkillsSearchIndexationForGroups } from "@app/lib/skill_search/indexation";
import { ServerSideTracking } from "@app/lib/tracking/server";
import mainLogger from "@app/logger/logger";
import { GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type {
  DirectoryUser,
  DsyncGroupCreatedEvent,
  DsyncGroupDeletedEvent,
  DsyncGroupUpdatedEvent,
  DsyncGroupUserAddedEvent,
  DsyncGroupUserRemovedEvent,
  DsyncUserCreatedEvent,
  DsyncUserDeletedEvent,
  DsyncUserUpdatedEvent,
  Event,
  OrganizationDomain,
  OrganizationDomainDeletedEvent,
  OrganizationDomainVerificationFailedEvent,
  OrganizationDomainVerifiedEvent,
  OrganizationUpdatedEvent,
} from "@workos-inc/node";
import { NotFoundException } from "@workos-inc/node";
import assert from "assert";

const logger = mainLogger.child(
  {},
  {
    msgPrefix: "[WorkOS Event] ",
  }
);

// Grace window for treating a user_added event as stale when the user was
// revoked around the same time. Covers races where WorkOS emits both events
// together but the revoke is processed a moment before the add is emitted.
const STALE_USER_ADDED_GRACE_MS = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Verify if workspace exist, if it does will call the callback with the found workspace.
 * Otherwise will return undefined
 */
async function verifyWorkOSWorkspace<E extends Event, R>(
  organizationId: string | null,
  event: E,
  handler: (workspace: LightWorkspaceType, event: E) => R
) {
  if (!organizationId) {
    return;
  }

  const workspace = await findWorkspaceByWorkOSOrganizationId(organizationId);
  if (!workspace) {
    logger.warn({ organizationId }, "Workspace not found for organization");
    // Skip processing if workspace not found - it likely belongs to another region.
    // This is expected in a multi-region setup. DataDog monitors these warnings
    // and will alert if they occur across all regions.
    return;
  }
  if (workspace) {
    const workspaceHasBeenRelocated = isWorkspaceRelocationDone(workspace);
    if (workspaceHasBeenRelocated) {
      logger.info(
        { workspaceId: workspace.sId },
        "Workspace has been relocated, skipping event"
      );
      return;
    }
  }

  // For dsync events, verify SCIM is enabled and the directoryId matches
  // the current organization's active directory.
  const { data: eventData } = event;
  if (
    isRecord(eventData) &&
    "directoryId" in eventData &&
    isString(eventData.directoryId)
  ) {
    const subscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    const plan = subscription?.getPlan();
    if (!plan || !isSCIMEnabled(plan)) {
      logger.warn(
        { workspaceId: workspace.sId, organizationId },
        "SCIM event received but neither the workspace plan nor a feature flag allows SCIM, skipping"
      );
      return;
    }

    const directoriesResult = await getWorkOSOrganizationDSyncDirectories({
      workspace,
    });
    if (directoriesResult.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, err: directoriesResult.error },
        "Failed to fetch directories for workspace"
      );
      return;
    }
    const activeDirectoryIds = new Set(
      directoriesResult.value.map((d) => d.id)
    );
    if (!activeDirectoryIds.has(eventData.directoryId)) {
      logger.info(
        { workspaceId: workspace.sId, directoryId: eventData.directoryId },
        "Event from disconnected directory, skipping"
      );
      return;
    }
  }

  return handler(workspace, event);
}

function emitMembershipRoleUpdatedFromDirectorySync({
  workspace,
  user,
  directoryId,
  previousRole,
  newRole,
}: {
  workspace: LightWorkspaceType;
  user: UserResource;
  directoryId?: string;
  previousRole: string;
  newRole: string;
}): void {
  void emitAuditLogEventDirect({
    workspace,
    action: "membership.role_updated",
    actor: {
      type: "system",
      id: String(directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: { location: "system" },
    metadata: {
      previous_role: previousRole,
      new_role: newRole,
    },
  });
}

/**
 * Handle role assignment based on the name of the group.
 */
async function handleRoleAssignmentForGroup(
  auth: Authenticator,
  {
    workspace,
    user,
    group,
    action,
    directoryId,
  }: {
    workspace: LightWorkspaceType;
    user: UserResource;
    group: GroupResource;
    action: "add" | "remove";
    directoryId?: string;
  }
) {
  if (group.name !== ADMIN_GROUP_NAME && group.name !== MANAGER_GROUP_NAME) {
    // Not a special group, no role assignment needed.
    return;
  }

  const currentMembership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });

  if (!currentMembership) {
    logger.warn(
      `User ${user.sId} has no active membership in workspace ${workspace.sId}, cannot assign role.`
    );
    return;
  }

  if (action === "add") {
    const newRole = await determineUserRoleFromGroups(auth, user);

    if (newRole !== currentMembership.role) {
      const updateResult = await MembershipResource.updateMembershipRole({
        user,
        workspace,
        newRole,
        allowLastAdminRemoval: true,
        author: auth.user()?.toJSON() ?? "no-author",
      });

      if (updateResult.isErr()) {
        logger.error(
          { error: updateResult.error, userId: user.sId, role: newRole },
          `Failed to assign ${newRole} role to user`
        );
        throw new Error(
          `Failed to assign ${newRole} role to user ${user.sId}: ${updateResult.error.type}`
        );
      }

      logger.info(
        {
          userId: user.sId,
          workspaceId: workspace.sId,
          oldRole: currentMembership.role,
          newRole,
          groupName: group.name,
        },
        "Assigned role to user based on group membership"
      );

      void ServerSideTracking.trackUpdateMembershipRole({
        user: user.toJSON(),
        workspace,
        previousRole: currentMembership.role,
        role: newRole,
      });

      emitMembershipRoleUpdatedFromDirectorySync({
        workspace,
        user,
        directoryId,
        previousRole: String(currentMembership.role),
        newRole: String(newRole),
      });
    }
  } else if (action === "remove") {
    const newRole = await determineUserRoleFromGroups(auth, user);

    if (newRole !== currentMembership.role) {
      const updateResult = await MembershipResource.updateMembershipRole({
        user,
        workspace,
        newRole,
        allowLastAdminRemoval: true,
        author: auth.user()?.toJSON() ?? "no-author",
      });

      if (updateResult.isErr()) {
        logger.error(
          { error: updateResult.error, userId: user.sId, role: newRole },
          "Failed to downgrade user role."
        );
        throw new Error(
          `Failed to downgrade user role for ${user.sId}: ${updateResult.error.type}`
        );
      }

      logger.info(
        {
          workspaceId: workspace.sId,
          userId: user.sId,
          oldRole: currentMembership.role,
          newRole,
          groupName: group.name,
        },
        "Downgraded user role after group removal"
      );

      void ServerSideTracking.trackUpdateMembershipRole({
        user: user.toJSON(),
        workspace,
        previousRole: currentMembership.role,
        role: newRole,
      });

      emitMembershipRoleUpdatedFromDirectorySync({
        workspace,
        user,
        directoryId,
        previousRole: String(currentMembership.role),
        newRole: String(newRole),
      });
    }
  }
}

// WorkOS webhooks do not guarantee event ordering. Events can arrive out of sequence.
// We rely on Temporal's retry strategies and the idempotency of these activities
// to correctly process events even if they are received in a non-chronological order.
export async function processWorkOSEventActivity({
  eventPayload,
}: {
  eventPayload: Event;
}) {
  switch (eventPayload.event) {
    case "organization_domain.verified":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleOrganizationDomainVerified
      );
      break;

    case "organization_domain.verification_failed":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleOrganizationDomainVerificationFailed
      );
      break;

    case "organization_domain.deleted":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleOrganizationDomainDeleted
      );
      break;

    case "organization.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.id,
        eventPayload,
        handleOrganizationUpdated
      );
      break;

    case "dsync.group.created":
    case "dsync.group.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleGroupUpsert
      );
      break;

    case "dsync.group.deleted":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleGroupDelete
      );
      break;

    case "dsync.group.user_added":
      await verifyWorkOSWorkspace(
        eventPayload.data.user.organizationId,
        eventPayload,
        handleUserAddedToGroup
      );
      break;

    case "dsync.group.user_removed":
      await verifyWorkOSWorkspace(
        eventPayload.data.user.organizationId,
        eventPayload,
        handleUserRemovedFromGroup
      );
      break;

    case "dsync.user.created":
    case "dsync.user.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleCreateOrUpdateWorkOSUser
      );
      break;

    case "dsync.user.deleted":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload,
        handleDeleteWorkOSUser
      );
      break;

    default:
      logger.info(
        { eventType: eventPayload.event },
        "Unhandled workOS event type -- skipping"
      );
      break;
  }
}

/**
 * Organization related events.
 */

async function handleOrganizationDomainEvent(
  workspace: LightWorkspaceType,
  eventData: OrganizationDomain,
  eventType: "verified" | "failed" | "deleted"
) {
  const { domain, state } = eventData;

  if (eventType !== "deleted") {
    assert(
      state === eventType,
      `Domain state mismatch: expected ${eventType} but got ${state}`
    );
  }

  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    throw new Error(`Workspace not found: ${workspace.sId}`);
  }

  if (eventType === "deleted") {
    const existingDomains = await workspaceResource.getVerifiedDomains();
    if (!existingDomains.some((existing) => existing.domain === domain)) {
      logger.info({ domain }, "Domain already deleted");
      return false;
    }
  }

  let domainResult: Result<any, Error>;
  if (eventType === "verified") {
    domainResult = await workspaceResource.upsertWorkspaceDomain({
      domain,
      // If a workspace has a verified domain, it means that they went through the DNS
      // verification process. If this domain is already assigned to another workspace,
      // we need to delete the domain from the other workspace.
      dropExistingDomain: true,
    });
  } else {
    domainResult = await workspaceResource.deleteDomain({ domain });
  }

  if (domainResult.isErr()) {
    logger.error(
      { error: domainResult.error },
      "Error updating/deleting domain"
    );
    throw domainResult.error;
  }

  logger.info({ domain }, "Domain updated/deleted");
  return true;
}

async function handleOrganizationDomainVerified(
  workspace: LightWorkspaceType,
  event: OrganizationDomainVerifiedEvent
) {
  const { data: eventData } = event;
  await handleOrganizationDomainEvent(workspace, eventData, "verified");

  void emitAuditLogEventDirect({
    workspace,
    action: "domain.verified",
    actor: { type: "system", id: "workos", name: "WorkOS" },
    targets: [{ type: "workspace", id: workspace.sId, name: workspace.name }],
    context: { location: "system" },
    metadata: { domain: eventData.domain },
  });
}

async function handleOrganizationDomainVerificationFailed(
  workspace: LightWorkspaceType,
  event: OrganizationDomainVerificationFailedEvent
) {
  const { data: eventData } = event;
  await handleOrganizationDomainEvent(workspace, eventData, "failed");

  void emitAuditLogEventDirect({
    workspace,
    action: "domain.verification_failed",
    actor: { type: "system", id: "workos", name: "WorkOS" },
    targets: [{ type: "workspace", id: workspace.sId, name: workspace.name }],
    context: { location: "system" },
    metadata: { domain: eventData.domain },
  });
}

async function handleOrganizationDomainDeleted(
  workspace: LightWorkspaceType,
  event: OrganizationDomainDeletedEvent
) {
  const { data: eventData } = event;
  const domainWasDeleted = await handleOrganizationDomainEvent(
    workspace,
    eventData,
    "deleted"
  );
  if (!domainWasDeleted) {
    return;
  }

  void emitAuditLogEventDirect({
    workspace,
    action: "domain.removed",
    actor: { type: "system", id: "workos", name: "WorkOS" },
    targets: [{ type: "workspace", id: workspace.sId, name: workspace.name }],
    context: { location: "system" },
    metadata: { domain: eventData.domain },
  });
}

async function handleOrganizationUpdated(
  workspace: LightWorkspaceType,
  event: OrganizationUpdatedEvent
) {
  const { domains } = event.data;

  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    throw new Error(`Workspace not found: ${workspace.sId}`);
  }

  const existingVerifiedDomains = await workspaceResource.getVerifiedDomains();
  const existingVerifiedDomainsSet = new Set(
    existingVerifiedDomains.map((d) => d.domain)
  );

  // Get all verified domains from WorkOS.
  const workOSVerifiedDomains = new Set(
    domains.filter((d) => d.state === "verified").map((d) => d.domain)
  );

  // Add new verified domains that don't exist yet.
  for (const domain of workOSVerifiedDomains) {
    if (!existingVerifiedDomainsSet.has(domain)) {
      const result = await workspaceResource.upsertWorkspaceDomain({ domain });

      // Swallow errors, we don't want to block the event from being processed. Sole error returned
      // is if the domain is already in use by another workspace.
      if (result.isErr()) {
        logger.error(
          { error: result.error, domain },
          "Error upserting workspace domain, skipping"
        );
      }
    }
  }

  // Delete domains that are no longer verified in WorkOS.
  for (const domain of existingVerifiedDomainsSet) {
    if (!workOSVerifiedDomains.has(domain)) {
      await workspaceResource.deleteDomain({ domain });
    }
  }
}

export async function handleWorkspaceSubscriptionCreated({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const workspace = await getWorkspaceInfos(workspaceId);
  if (!workspace) {
    logger.info({ workspaceId }, "Workspace not found");
    throw new Error(`Workspace not found for workspace ${workspaceId}`);
  }

  // If workspace already has an organization, skip.
  if (workspace.workOSOrganizationId) {
    logger.info({ workspaceId }, "Workspace already has a WorkOS organization");
    return;
  }

  const organisationRes = await getOrCreateWorkOSOrganization(workspace);
  if (organisationRes.isErr()) {
    logger.error(
      { error: organisationRes.error },
      "Error creating WorkOS organization"
    );
    throw organisationRes.error;
  }
}

/**
 * Auto-create a restricted space for a provisioned group if the workspace setting is enabled.
 * This function ensures idempotency by checking if a space already exists for the group.
 */
async function autoCreateSpaceForProvisionedGroup(
  auth: Authenticator,
  group: GroupResource,
  workspace: LightWorkspaceType
): Promise<void> {
  // Check if a space already exists for this group
  const existingSpaces = await SpaceResource.listForGroups(auth, [group]);

  if (existingSpaces.length > 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        groupId: group.sId,
        groupName: group.name,
        spaceId: existingSpaces[0].sId,
      },
      "Space already exists for provisioned group, skipping auto-creation"
    );
    return;
  }

  // Create restricted space with group-based management
  const spaceName = group.name;

  const spaceResult = await createSpaceAndGroup(
    auth,
    {
      name: spaceName,
      groupIds: [group.sId],
      isRestricted: true,
      managementMode: "group",
      spaceKind: "regular",
    },
    { ignoreWorkspaceLimit: false }
  );

  if (spaceResult.isErr()) {
    // Log error but don't throw - we don't want to fail the group creation
    // if space creation fails (e.g., due to limit reached or name conflict)
    logger.error(
      {
        error: spaceResult.error,
        groupId: group.sId,
        groupName: group.name,
        workspaceId: workspace.sId,
      },
      "Failed to auto-create space for provisioned group"
    );
    return;
  }

  logger.info(
    {
      spaceId: spaceResult.value.sId,
      spaceName: spaceResult.value.name,
      groupId: group.sId,
      groupName: group.name,
      workspaceId: workspace.sId,
    },
    "Auto-created space for provisioned group"
  );
}

async function handleGroupUpsert(
  workspace: LightWorkspaceType,
  event: DsyncGroupCreatedEvent | DsyncGroupUpdatedEvent
) {
  const { data: eventData } = event;
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const groupByName = await GroupResource.dangerouslyFetchByName(
    auth,
    eventData.name
  );
  if (groupByName && groupByName.workOSGroupId !== eventData.id) {
    // Conflict - another group with the same name already exists.

    // First check if this group still exists in workos.
    try {
      await getWorkOS().directorySync.getGroup(eventData.id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Group doesn't exist, just ignore the event.
        return;
      }
      throw error;
    }

    // Another group with the same name exists and is not a provisioned group, throw an error.
    if (groupByName.kind !== "provisioned" || !groupByName.workOSGroupId) {
      throw new Error(
        `Group "${groupByName.name}" already exists and is not a provisioned group`
      );
    }

    // Check if the existing group belongs to a disconnected directory.
    // The old group may still exist in WorkOS but from a directory that is
    // no longer active for this organization.
    let oldGroup;
    try {
      oldGroup = await getWorkOS().directorySync.getGroup(
        groupByName.workOSGroupId
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        logger.info(
          {
            workOsGroupId: groupByName.workOSGroupId,
            groupName: groupByName.name,
            workspaceId: workspace.sId,
          },
          "Group not found in WorkOS (404), deleting local group"
        );
        await groupByName.delete(auth);
      } else {
        throw error;
      }
    }

    if (oldGroup) {
      const directoriesResult = await getWorkOSOrganizationDSyncDirectories({
        workspace,
      });
      if (directoriesResult.isErr()) {
        throw new Error(
          `Failed to fetch directories for workspace: ${directoriesResult.error.message}`
        );
      }
      const activeDirectoryIds = new Set(
        directoriesResult.value.map((d) => d.id)
      );
      if (activeDirectoryIds.has(oldGroup.directoryId)) {
        throw new Error(
          `Group "${groupByName.name}" still exists in an active directory with id "${groupByName.workOSGroupId}"`
        );
      }

      // The old group belongs to a disconnected directory, delete it.
      logger.info(
        {
          oldWorkOsGroupId: groupByName.workOSGroupId,
          oldDirectoryId: oldGroup.directoryId,
          newWorkOsGroupId: eventData.id,
          newDirectoryId: eventData.directoryId,
          groupName: groupByName.name,
          workspaceId: workspace.sId,
        },
        "Group belongs to disconnected directory, deleting local group"
      );
      await groupByName.delete(auth);
    }
  }

  const group = await GroupResource.upsertByWorkOSGroupId(auth, eventData);

  // Auto-create space if workspace setting is enabled
  let spaceCreated = false;
  if (workspace.metadata?.autoCreateSpaceForProvisionedGroups) {
    const existingSpaces = await SpaceResource.listForGroups(auth, [group]);
    const hadSpaceBefore = existingSpaces.length > 0;
    await autoCreateSpaceForProvisionedGroup(auth, group, workspace);
    if (!hadSpaceBefore) {
      const spacesAfter = await SpaceResource.listForGroups(auth, [group]);
      spaceCreated = spacesAfter.length > 0;
    }
  }

  void emitAuditLogEventDirect({
    workspace,
    action: "scim.group_created",
    actor: {
      type: "system",
      id: String(eventData.directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("group", group),
    ],
    context: { location: "system" },
    metadata: {
      group_name: group.name,
      directory_id: String(eventData.directoryId ?? "unknown"),
      space_created: String(spaceCreated),
    },
  });
}

async function handleUserAddedToGroup(
  workspace: LightWorkspaceType,
  event: DsyncGroupUserAddedEvent
) {
  const { data: eventData, createdAt } = event;
  const eventCreatedAt = new Date(createdAt);

  if (!eventData.user.email) {
    logger.warn(
      { workspaceId: workspace.sId, userId: eventData.user.id },
      "Try to 'dsync.group.user_added' without an email"
    );
    return;
  }

  const workOSUserRes = await fetchOrCreateWorkOSUserWithEmail({
    workspace,
    workOSUser: eventData.user,
  });
  if (workOSUserRes.isErr()) {
    throw workOSUserRes.error;
  }
  const workOSUser = workOSUserRes.value;

  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  if (!user) {
    throw new Error(`User not found with workOSId "${workOSUser.id}"`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const group = await GroupResource.fetchByWorkOSGroupId(
    auth,
    eventData.group.id
  );
  if (!group) {
    throw new Error(
      `Group not found for workOSId "${eventData.group.id}" in workspace "${workspace.sId}"`
    );
  }

  const isMember = await group.isMember(user);
  if (!isMember) {
    const res = await group.dangerouslyAddMember(auth, {
      user: user.toJSON(),
      allowProvisionedGroups: true,
    });
    if (res.isErr()) {
      // Races can occur when WorkOS delivers a user_added event together with a
      // membership revocation and the revoke is processed first. In that case
      // we want to drop the event.
      if (res.error.code === "user_not_found") {
        const latestMembership =
          await MembershipResource.getLatestMembershipOfUserInWorkspace({
            user,
            workspace,
          });
        if (
          latestMembership?.endAt &&
          Math.abs(
            latestMembership.endAt.getTime() - eventCreatedAt.getTime()
          ) <= STALE_USER_ADDED_GRACE_MS
        ) {
          logger.info(
            {
              userId: user.sId,
              groupId: group.sId,
              workspaceId: workspace.sId,
              eventCreatedAt,
              membershipEndAt: latestMembership.endAt,
            },
            "Dropping stale dsync.group.user_added: user revoked after event"
          );
          return;
        }
      }
      throw new Error(res.error.message);
    }
  } else {
    logger.info(
      {
        userId: user.sId,
        groupId: group.sId,
        workspaceId: workspace.sId,
      },
      "User is already member of group, skipping"
    );
  }

  // Handle role assignment for special groups.
  await handleRoleAssignmentForGroup(auth, {
    workspace,
    user,
    group,
    action: "add",
    directoryId: eventData.directoryId ?? undefined,
  });

  // Update membership origin to "provisioned" when syncing from WorkOS groups.
  const currentMembership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });

  if (currentMembership && currentMembership.origin !== "provisioned") {
    const { previousOrigin, newOrigin } = await currentMembership.updateOrigin({
      user,
      workspace,
      newOrigin: "provisioned",
      author: auth.user()?.toJSON() ?? "no-author",
    });

    logger.info(
      {
        userId: user.sId,
        previousOrigin,
        newOrigin,
        groupName: group.name,
        workspaceId: workspace.sId,
      },
      "Updated membership origin to provisioned based on group sync"
    );

    void emitAuditLogEventDirect({
      workspace,
      action: "membership.origin_updated",
      actor: {
        type: "system",
        id: String(eventData.directoryId ?? "directory_sync"),
        name: "Directory Sync",
      },
      targets: [
        buildAuditLogTarget("workspace", workspace),
        buildAuditLogTarget("user", {
          sId: user.sId,
          name: user.fullName() ?? "unknown",
        }),
      ],
      context: { location: "system" },
      metadata: {
        previous_origin: previousOrigin,
        new_origin: newOrigin,
      },
    });
  }

  void emitAuditLogEventDirect({
    workspace,
    action: "scim.group_user_added",
    actor: {
      type: "system",
      id: String(eventData.directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("group", group),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: { location: "system" },
    metadata: {
      group_name: group.name,
      user_email: user.email,
      directory_id: String(eventData.user.directoryId ?? "unknown"),
      role_granted: "member",
    },
  });
}

async function handleUserRemovedFromGroup(
  workspace: LightWorkspaceType,
  event: DsyncGroupUserRemovedEvent
) {
  const { data: eventData } = event;

  if (!eventData.user.email) {
    logger.warn("Try to 'dsync.group.user_removed' without an email");
    return;
  }

  const workOSUserRes = await fetchWorkOSUserWithEmail({
    workspace,
    workOSUser: eventData.user,
  });
  if (workOSUserRes.isErr()) {
    throw workOSUserRes.error;
  }
  const workOSUser = workOSUserRes.value;

  // Unknown to WorkOS and to us: nothing to deprovision, removing them from a
  // group is a no-op.
  if (!workOSUser) {
    logger.info(
      { workspaceId: workspace.sId, directoryUserId: eventData.user.id },
      "User to remove from group not found in WorkOS, skipping group removal"
    );
    return;
  }

  // Known to WorkOS but not to us: provisioning never went through, so surface it.
  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  if (!user) {
    throw new Error(`User not found with workOSId "${workOSUser.id}"`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const group = await GroupResource.fetchByWorkOSGroupId(
    auth,
    eventData.group.id
  );
  if (!group) {
    throw new Error(
      `Group not found for workOSId "${eventData.group.id}" in workspace "${workspace.sId}"`
    );
  }

  // Check if user is still a member of the workspace before removing from group
  const { total } = await MembershipResource.getActiveMemberships({
    users: [user],
    workspace,
  });

  if (total === 0) {
    logger.info(
      {
        userId: user.sId,
        groupName: group.name,
        workspaceId: workspace.sId,
      },
      "Skipping group removal - user is no longer a member of workspace"
    );
    return;
  }

  // No canWrite guard here — `auth` is always internalAdminForWorkspace
  // (trusted SCIM/directory sync), and canWrite returns false for agent_editors
  // groups (their admin role lacks "write"), which would wrongly abort
  // deprovisioning. dangerouslyRemoveMember is the intended trusted path.
  const res = await group.dangerouslyRemoveMember(auth, {
    user: user.toJSON(),
    allowProvisionedGroups: true,
  });
  if (res.isErr() && res.error.code !== "user_not_member") {
    throw new Error(res.error.message);
  }

  // Handle role assignment for special groups.
  await handleRoleAssignmentForGroup(auth, {
    workspace,
    user,
    group,
    action: "remove",
    directoryId: eventData.directoryId ?? undefined,
  });

  void emitAuditLogEventDirect({
    workspace,
    action: "scim.group_user_removed",
    actor: {
      type: "system",
      id: String(eventData.directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("group", group),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: { location: "system" },
    metadata: {
      group_name: group.name,
      user_email: user.email,
      directory_id: String(eventData.user.directoryId ?? "unknown"),
      role_change: "removed",
    },
  });
}

// Extracts WorkOS custom attributes from DirectoryUser.
function extractCustomAttributes(
  directoryUser: DirectoryUser
): Record<CustomAttributeKey, string | null> {
  const result: Record<CustomAttributeKey, string | null> = {
    job_title: null,
    department_name: null,
  };

  const { customAttributes } = directoryUser;
  if (isRecord(customAttributes)) {
    for (const attr of CUSTOM_ATTRIBUTES_TO_SYNC) {
      const value = customAttributes[attr];
      if (typeof value === "string" && value.trim() !== "") {
        result[attr] = value.trim();
      }
    }
  }

  return result;
}

// Clears all WorkOS custom attributes for a user in a workspace.
// Called when the user is deleted from the directory.
async function clearCustomAttributesFromUserMetadata(
  user: UserResource,
  workspace: LightWorkspaceType
): Promise<void> {
  for (const attr of CUSTOM_ATTRIBUTES_TO_SYNC) {
    await user.deleteMetadata({
      key: `${WORKOS_METADATA_KEY_PREFIX}${attr}`,
      workspaceId: workspace.id,
    });
  }
  logger.info(
    { userId: user.sId, workspaceId: workspace.sId },
    "Cleared WorkOS custom attributes from user metadata"
  );
}

async function handleCreateOrUpdateWorkOSUser(
  workspace: LightWorkspaceType,
  event: DsyncUserCreatedEvent | DsyncUserUpdatedEvent
) {
  const { data: eventData } = event;

  // Entra (and other IdPs) disable users via SCIM PATCH active=false, which WorkOS translates
  // into dsync.user.updated with state='inactive' rather than dsync.user.deleted. Treat this
  // the same as deletion: revoke membership and remove from all groups. Being a deprovisioning
  // path, it must not create the WorkOS user it fails to find.
  if (eventData.state === "inactive") {
    const inactiveWorkOSUserRes = await fetchWorkOSUserWithEmail({
      workspace,
      workOSUser: eventData,
    });
    if (inactiveWorkOSUserRes.isErr()) {
      throw inactiveWorkOSUserRes.error;
    }
    const inactiveWorkOSUser = inactiveWorkOSUserRes.value;

    if (!inactiveWorkOSUser) {
      logger.info(
        { workspaceId: workspace.sId, directoryUserId: eventData.id },
        "Inactive user not found in WorkOS, skipping revocation"
      );
      return;
    }

    // Known to WorkOS but not to us: provisioning never went through, so surface it.
    const inactiveUser = await UserResource.fetchByWorkOSUserId(
      inactiveWorkOSUser.id
    );
    if (!inactiveUser) {
      throw new Error(
        `User not found with workOSId "${inactiveWorkOSUser.id}"`
      );
    }

    await revokeWorkOSUserMembership({
      workspace,
      user: inactiveUser,
      directoryId: eventData.directoryId,
      eventCreatedAt: new Date(event.createdAt),
      triggersDeleted: false,
    });
    return;
  }

  const workOSUserRes = await fetchOrCreateWorkOSUserWithEmail({
    workspace,
    workOSUser: eventData,
  });
  if (workOSUserRes.isErr()) {
    throw workOSUserRes.error;
  }
  const workOSUser = workOSUserRes.value;

  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);

  const externalUser: ExternalUser = {
    email: workOSUser.email,
    email_verified: true,
    name: workOSUser.email ?? "",
    nickname: getUserNicknameFromEmail(workOSUser.email) ?? "",
    workOSUserId: workOSUser.id,
    given_name: workOSUser.firstName ?? undefined,
    family_name: workOSUser.lastName ?? undefined,
    picture: workOSUser.profilePictureUrl ?? undefined,
    customAttributes: extractCustomAttributes(eventData),
  };

  const { user: createdOrUpdatedUser } = await createOrUpdateUser({
    user,
    externalUser,
    forceNameUpdate: !!(workOSUser.firstName && workOSUser.lastName),
    workspace,
  });

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: createdOrUpdatedUser,
      workspace,
    });
  if (membership) {
    logger.info(
      {
        userId: createdOrUpdatedUser.sId,
        workspaceId: workspace.sId,
      },
      "User already has a membership associated to workspace"
    );
    const { previousOrigin, newOrigin } = await membership.updateOrigin({
      user: createdOrUpdatedUser,
      workspace,
      newOrigin: "provisioned",
      author: createdOrUpdatedUser.toJSON(),
    });
    // A retry can arrive after createAndTrackMembership restored editor-group
    // rows but before their indexation launch completed. Re-reading current
    // grants makes that retry converge.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const currentGrantGroups =
      await GroupResource.dangerouslyListAllUserGroupsInWorkspace({
        auth,
        user: createdOrUpdatedUser,
        groupKinds: ["regular_auto"],
        dangerouslySkipMembershipCheck: true,
      });
    await launchSkillsSearchIndexationForGroups({
      workspace,
      groupModelIds: currentGrantGroups.map((group) => group.id),
    });

    void emitAuditLogEventDirect({
      workspace,
      action: "membership.origin_updated",
      actor: {
        type: "system",
        id: String(eventData.directoryId ?? "directory_sync"),
        name: "Directory Sync",
      },
      targets: [
        buildAuditLogTarget("workspace", workspace),
        buildAuditLogTarget("user", {
          sId: createdOrUpdatedUser.sId,
          name: createdOrUpdatedUser.fullName() ?? "unknown",
        }),
      ],
      context: { location: "system" },
      metadata: {
        previous_origin: previousOrigin,
        new_origin: newOrigin,
      },
    });

    void emitAuditLogEventDirect({
      workspace,
      action: "scim.user_updated",
      actor: {
        type: "system",
        id: String(eventData.directoryId ?? "directory_sync"),
        name: "Directory Sync",
      },
      targets: [
        buildAuditLogTarget("workspace", workspace),
        buildAuditLogTarget("user", {
          sId: createdOrUpdatedUser.sId,
          name: createdOrUpdatedUser.fullName() ?? "unknown",
        }),
      ],
      context: { location: "system" },
      metadata: {
        directory_id: String(eventData.directoryId ?? "unknown"),
        updated_attributes: JSON.stringify(
          Object.keys(eventData.rawAttributes ?? {})
        ),
      },
    });

    return;
  }

  await createAndTrackMembership({
    user: createdOrUpdatedUser,
    workspace,
    role: "user",
    origin: "provisioned",
    auditActor: {
      type: "system",
      id: String(eventData.directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
  });

  void emitAuditLogEventDirect({
    workspace,
    action: "scim.user_provisioned",
    actor: {
      type: "system",
      id: String(eventData.directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: createdOrUpdatedUser.sId,
        name: createdOrUpdatedUser.fullName() ?? "unknown",
      }),
    ],
    context: { location: "system" },
    metadata: {
      email: createdOrUpdatedUser.email,
      directory_id: String(eventData.directoryId ?? "unknown"),
    },
  });
}

async function revokeWorkOSUserMembership({
  workspace,
  user,
  directoryId,
  eventCreatedAt,
  triggersDeleted,
}: {
  workspace: LightWorkspaceType;
  user: UserResource;
  directoryId: string | null | undefined;
  eventCreatedAt: Date;
  triggersDeleted: boolean;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const groupKinds = GROUP_KINDS.filter(
    (kind) => kind !== "system" && kind !== "global"
  );
  const latestMembership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  const revokedAt = latestMembership?.isRevoked()
    ? latestMembership.endAt
    : null;
  const activeGroups =
    await GroupResource.dangerouslyListAllUserGroupsInWorkspace({
      auth,
      user,
      groupKinds,
      dangerouslySkipMembershipCheck: true,
    });
  const historicalLookupAt = revokedAt
    ? new Date(revokedAt.getTime() - GROUP_MEMBERSHIP_RESTORE_TOLERANCE_MS)
    : eventCreatedAt;
  // Keep the event-time view as well as the current one. If an earlier attempt
  // ended group rows before failing, a retry can still recover the affected
  // editor grants and enqueue their skills.
  const recentlyActiveGroups =
    await GroupResource.dangerouslyListAllUserGroupsInWorkspace({
      auth,
      user,
      groupKinds,
      at: historicalLookupAt,
      dangerouslySkipMembershipCheck: true,
    });
  const affectedGroups = [
    ...new Map(
      [...activeGroups, ...recentlyActiveGroups].map((group) => [
        group.id,
        group,
      ])
    ).values(),
  ];

  for (const group of activeGroups) {
    // No canWrite guard here — see handleUserRemovedFromGroup. `auth` is
    // internalAdminForWorkspace, and canWrite is false for agent_editors
    // groups, which would wrongly abort deprovisioning of editor users.
    const removeResult = await group.dangerouslyRemoveMember(auth, {
      user: user.toJSON(),
      allowProvisionedGroups: true,
    });
    if (removeResult.isErr()) {
      logger.warn(
        {
          userId: user.sId,
          groupId: group.sId,
          error: removeResult.error,
        },
        "Failed to remove user from group"
      );
    }
  }

  const membershipRevokeResult = await revokeAndTrackMembership(auth, user, {
    allowLastAdminRevocation: true,
    auditActor: {
      type: "system",
      id: String(directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
  });

  if (
    membershipRevokeResult.isErr() &&
    membershipRevokeResult.error.type !== "already_revoked"
  ) {
    throw membershipRevokeResult.error;
  }

  await launchSkillsSearchIndexationForGroups({
    workspace,
    groupModelIds: affectedGroups
      .filter((group) => group.isRegularAuto())
      .map((group) => group.id),
  });
  if (membershipRevokeResult.isErr()) {
    logger.info(
      { userId: user.sId, workspaceId: workspace.sId },
      "User membership already revoked, skipping"
    );
    return;
  }

  // Emit SCIM-specific audit event in addition to the generic membership.revoked.
  void emitAuditLogEventDirect({
    workspace,
    action: "scim.user_deprovisioned",
    actor: {
      type: "system",
      id: String(directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: { location: "system" },
    metadata: {
      email: user.email,
      directory_id: String(directoryId ?? "unknown"),
      triggers_deleted: String(triggersDeleted),
    },
  });
}

async function handleDeleteWorkOSUser(
  workspace: LightWorkspaceType,
  event: DsyncUserDeletedEvent
) {
  const { data: eventData } = event;
  const workOSUserRes = await fetchWorkOSUserWithEmail({
    workspace,
    workOSUser: eventData,
  });
  if (workOSUserRes.isErr()) {
    throw workOSUserRes.error;
  }
  const workOSUser = workOSUserRes.value;

  // Unknown to WorkOS and to us: nothing to delete.
  if (!workOSUser) {
    logger.info(
      { workspaceId: workspace.sId, directoryUserId: eventData.id },
      "User to delete not found in WorkOS, likely already deleted"
    );
    return;
  }

  // Known to WorkOS but not to us: provisioning never went through, so surface it.
  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  if (!user) {
    throw new Error(
      `Did not find user to delete for workOSUserId "${workOSUser.id}" in workspace "${workspace.sId}"`
    );
  }

  // Clear WorkOS custom attributes before revoking membership.
  await clearCustomAttributesFromUserMetadata(user, workspace);

  await revokeWorkOSUserMembership({
    workspace,
    user,
    directoryId: eventData.directoryId,
    eventCreatedAt: new Date(event.createdAt),
    triggersDeleted: true,
  });
}

async function handleGroupDelete(
  workspace: LightWorkspaceType,
  event: DsyncGroupDeletedEvent
) {
  const { data: eventData } = event;
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const group = await GroupResource.fetchByWorkOSGroupId(auth, eventData.id);

  if (!group) {
    // Group already deleted, log and return success to avoid blocking the workflow
    logger.info(
      {
        workspaceId: workspace.sId,
        directoryId: eventData.directoryId,
        groupId: eventData.id,
      },
      "Group to delete not found, likely already deleted"
    );
    return;
  }

  const groupSId = group.sId;
  const groupName = group.name;

  const deleteResult = await group.delete(auth);
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }

  void emitAuditLogEventDirect({
    workspace,
    action: "scim.group_deleted",
    actor: {
      type: "system",
      id: String(eventData.directoryId ?? "directory_sync"),
      name: "Directory Sync",
    },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("group", { sId: groupSId, name: groupName }),
    ],
    context: { location: "system" },
    metadata: {
      group_name: groupName,
      directory_id: String(eventData.directoryId ?? "unknown"),
    },
  });
}
