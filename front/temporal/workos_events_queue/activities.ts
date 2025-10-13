import type {
  DirectoryGroup,
  DirectoryUser,
  DsyncGroupUserAddedEvent,
  DsyncGroupUserRemovedEvent,
  Event,
  Organization,
  OrganizationDomain,
} from "@workos-inc/node";
import assert from "assert";

import { createAndLogMembership } from "@app/lib/api/signup";
import { determineUserRoleFromGroups } from "@app/lib/api/user";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import {
  fetchOrCreateWorkOSUserWithEmail,
  getUserNicknameFromEmail,
} from "@app/lib/api/workos/user";
import {
  findWorkspaceByWorkOSOrganizationId,
  getWorkspaceInfos,
  isWorkspaceRelocationDone,
} from "@app/lib/api/workspace";
import {
  deleteWorkspaceDomain,
  getWorkspaceVerifiedDomains,
  upsertWorkspaceDomain,
} from "@app/lib/api/workspace_domains";
import { Authenticator } from "@app/lib/auth";
import type { ExternalUser } from "@app/lib/iam/provider";
import { createOrUpdateUser } from "@app/lib/iam/users";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import mainLogger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";

const logger = mainLogger.child(
  {},
  {
    msgPrefix: "[WorkOS Event] ",
  }
);

const ADMIN_GROUP_NAME = "dust-admins";
const BUILDER_GROUP_NAME = "dust-builders";

/**
 * Verify if workspace exist, if it does will call the callback with the found workspace.
 * Otherwise will return undefined
 */
async function verifyWorkOSWorkspace<E extends object, R>(
  organizationId: string | null,
  event: E,
  handler: (workspace: LightWorkspaceType, eventData: E) => R
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

  return handler(workspace, event);
}

/**
 * Handle role assignment based on the name of the group.
 */
async function handleRoleAssignmentForGroup({
  workspace,
  user,
  group,
  action,
}: {
  workspace: LightWorkspaceType;
  user: UserResource;
  group: GroupResource;
  action: "add" | "remove";
}) {
  if (group.name !== ADMIN_GROUP_NAME && group.name !== BUILDER_GROUP_NAME) {
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
    const newRole = await determineUserRoleFromGroups(workspace, user);

    if (newRole !== currentMembership.role) {
      const updateResult = await MembershipResource.updateMembershipRole({
        user,
        workspace,
        newRole,
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
          oldRole: currentMembership.role,
          newRole,
          groupName: group.name,
        },
        `Assigned ${newRole} role to user based on group membership`
      );

      void ServerSideTracking.trackUpdateMembershipRole({
        user: user.toJSON(),
        workspace,
        previousRole: currentMembership.role,
        role: newRole,
      });
    }
  } else if (action === "remove") {
    const newRole = await determineUserRoleFromGroups(workspace, user);

    if (newRole !== currentMembership.role) {
      const updateResult = await MembershipResource.updateMembershipRole({
        user,
        workspace,
        newRole,
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
        eventPayload.data,
        handleOrganizationDomainVerified
      );
      break;

    case "organization_domain.verification_failed":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
        handleOrganizationDomainVerificationFailed
      );
      break;

    case "organization.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.id,
        eventPayload.data,
        handleOrganizationUpdated
      );
      break;

    case "dsync.group.created":
    case "dsync.group.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
        handleGroupUpsert
      );
      break;

    case "dsync.group.deleted":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
        handleGroupDelete
      );
      break;

    case "dsync.group.user_added":
      await verifyWorkOSWorkspace(
        eventPayload.data.user.organizationId,
        eventPayload.data,
        handleUserAddedToGroup
      );
      break;

    case "dsync.group.user_removed":
      await verifyWorkOSWorkspace(
        eventPayload.data.user.organizationId,
        eventPayload.data,
        handleUserRemovedFromGroup
      );
      break;

    case "dsync.user.created":
    case "dsync.user.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
        handleCreateOrUpdateWorkOSUser
      );
      break;

    case "dsync.user.deleted":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
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
  expectedState: "verified" | "failed"
) {
  const { domain, state } = eventData;

  assert(
    state === expectedState,
    `Domain state is not ${expectedState} -- expected ${expectedState} but got ${state}`
  );

  let domainResult: Result<any, Error>;
  if (expectedState === "verified") {
    domainResult = await upsertWorkspaceDomain(workspace, {
      domain,
      // If a workspace has a verified domain, it means that they went through the DNS
      // verification process. If this domain is already assigned to another workspace,
      // we need to delete the domain from the other workspace.
      dropExistingDomain: true,
    });
  } else {
    domainResult = await deleteWorkspaceDomain(workspace, { domain });
  }

  if (domainResult.isErr()) {
    logger.error(
      { error: domainResult.error },
      "Error updating/deleting domain"
    );
    throw domainResult.error;
  }

  logger.info({ domain }, "Domain updated/deleted");
}

async function handleOrganizationDomainVerified(
  workspace: LightWorkspaceType,
  eventData: OrganizationDomain
) {
  await handleOrganizationDomainEvent(workspace, eventData, "verified");
}

async function handleOrganizationDomainVerificationFailed(
  workspace: LightWorkspaceType,
  eventData: OrganizationDomain
) {
  await handleOrganizationDomainEvent(workspace, eventData, "failed");
}

async function handleOrganizationUpdated(
  workspace: LightWorkspaceType,
  eventData: Organization
) {
  const { domains } = eventData;

  const existingVerifiedDomains = await getWorkspaceVerifiedDomains(workspace);
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
      const result = await upsertWorkspaceDomain(workspace, { domain });

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
      await deleteWorkspaceDomain(workspace, { domain });
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

async function handleGroupUpsert(
  workspace: LightWorkspaceType,
  event: DirectoryGroup
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  await GroupResource.upsertByWorkOSGroupId(auth, event);
}

async function handleUserAddedToGroup(
  workspace: LightWorkspaceType,
  event: DsyncGroupUserAddedEvent["data"]
) {
  if (!event.user.email) {
    logger.warn("Try to 'dsync.group.user_added' without an email");
    return;
  }

  const workOSUserRes = await fetchOrCreateWorkOSUserWithEmail({
    workspace,
    workOSUser: event.user,
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
  const group = await GroupResource.fetchByWorkOSGroupId(auth, event.group.id);
  if (!group) {
    throw new Error(
      `Group not found for workOSId "${event.group.id}" in workspace "${workspace.sId}"`
    );
  }

  const isMember = await group.isMember(user);
  if (!isMember) {
    const res = await group.addMember(auth, user.toJSON());
    if (res.isErr()) {
      throw new Error(res.error.message);
    }
  } else {
    logger.info(
      `User "${user.sId}" is already member of group "${group.sId}", skipping`
    );
  }

  // Handle role assignment for special groups.
  await handleRoleAssignmentForGroup({ workspace, user, group, action: "add" });

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
    });

    logger.info(
      {
        userId: user.sId,
        previousOrigin,
        newOrigin,
        groupName: group.name,
      },
      "Updated membership origin to provisioned based on group sync"
    );
  }
}

async function handleUserRemovedFromGroup(
  workspace: LightWorkspaceType,
  event: DsyncGroupUserRemovedEvent["data"]
) {
  if (!event.user.email) {
    logger.warn("Try to 'dsync.group.user_removed' without an email");
    return;
  }

  const workOSUserRes = await fetchOrCreateWorkOSUserWithEmail({
    workspace,
    workOSUser: event.user,
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
  const group = await GroupResource.fetchByWorkOSGroupId(auth, event.group.id);
  if (!group) {
    throw new Error(
      `Group not found for workOSId "${event.group.id}" in workspace "${workspace.sId}"`
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
      },
      "Skipping group removal - user is no longer a member of workspace"
    );
    return;
  }

  const res = await group.removeMember(auth, user.toJSON());
  if (res.isErr()) {
    throw new Error(res.error.message);
  }

  // Handle role assignment for special groups.
  await handleRoleAssignmentForGroup({
    workspace,
    user,
    group,
    action: "remove",
  });
}

async function handleCreateOrUpdateWorkOSUser(
  workspace: LightWorkspaceType,
  event: DirectoryUser
) {
  const workOSUserRes = await fetchOrCreateWorkOSUserWithEmail({
    workspace,
    workOSUser: event,
  });
  if (workOSUserRes.isErr()) {
    throw workOSUserRes.error;
  }
  const workOSUser = workOSUserRes.value;

  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  const externalUser: ExternalUser = {
    auth0Sub: null,
    email: workOSUser.email,
    email_verified: true,
    name: workOSUser.email ?? "",
    nickname: getUserNicknameFromEmail(workOSUser.email) ?? "",
    workOSUserId: workOSUser.id,
    given_name: workOSUser.firstName ?? undefined,
    family_name: workOSUser.lastName ?? undefined,
    picture: workOSUser.profilePictureUrl ?? undefined,
  };

  const { user: createdOrUpdatedUser } = await createOrUpdateUser({
    user,
    externalUser,
    forceNameUpdate: !!(workOSUser.firstName && workOSUser.lastName),
  });

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: createdOrUpdatedUser,
      workspace,
    });
  if (membership) {
    logger.info(
      `User ${createdOrUpdatedUser.sId} already have a membership associated to workspace "${workspace.sId}"`
    );
    await membership.updateOrigin({
      user: createdOrUpdatedUser,
      workspace,
      newOrigin: "provisioned",
    });
    return;
  }

  await createAndLogMembership({
    user: createdOrUpdatedUser,
    workspace,
    role: "user",
    origin: "provisioned",
  });
}

async function handleDeleteWorkOSUser(
  workspace: LightWorkspaceType,
  event: DirectoryUser
) {
  const workOSUserRes = await fetchOrCreateWorkOSUserWithEmail({
    workspace,
    workOSUser: event,
  });
  if (workOSUserRes.isErr()) {
    throw workOSUserRes.error;
  }
  const workOSUser = workOSUserRes.value;

  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  if (!user) {
    throw new Error(
      `Did not find user to delete for workOSUserId "${workOSUser.id}" in workspace "${workspace.sId}"`
    );
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const groups = await GroupResource.listUserGroupsInWorkspace({
    user,
    workspace,
  });

  for (const group of groups) {
    const removeResult = await group.removeMember(auth, user.toJSON());
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

  const membershipRevokeResult = await MembershipResource.revokeMembership({
    user,
    workspace,
  });

  if (membershipRevokeResult.isErr()) {
    if (membershipRevokeResult.error.type === "already_revoked") {
      logger.info(
        {
          userId: user.sId,
          workspaceId: workspace.sId,
        },
        "User membership already revoked, skipping"
      );
      return;
    }
    throw membershipRevokeResult.error;
  }

  void ServerSideTracking.trackRevokeMembership({
    user: user.toJSON(),
    workspace,
    ...membershipRevokeResult.value,
  });
}

async function handleGroupDelete(
  workspace: LightWorkspaceType,
  event: DirectoryGroup
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const group = await GroupResource.fetchByWorkOSGroupId(auth, event.id);

  if (!group) {
    // Group already deleted, log and return success to avoid blocking the workflow
    logger.info(
      {
        workspaceId: workspace.sId,
        directoryId: event.directoryId,
        groupId: event.id,
      },
      "Group to delete not found, likely already deleted"
    );
    return;
  }

  const deleteResult = await group.delete(auth);
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}
