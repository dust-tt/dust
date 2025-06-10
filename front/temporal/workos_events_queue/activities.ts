import type {
  DirectoryUser,
  DsyncGroupUserAddedEvent,
  DsyncGroupUserRemovedEvent,
  Event,
  OrganizationDomain,
} from "@workos-inc/node";
import assert from "assert";
import _ from "lodash";

import { getWorkOS } from "@app/lib/api/workos/client";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { getUserNicknameFromEmail } from "@app/lib/api/workos/user";
import {
  findWorkspaceByWorkOSOrganizationId,
  getWorkspaceInfos,
} from "@app/lib/api/workspace";
import {
  deleteWorkspaceDomain,
  upsertWorkspaceDomain,
} from "@app/lib/api/workspace_domains";
import { Authenticator } from "@app/lib/auth";
import type { ExternalUser } from "@app/lib/iam/provider";
import { createOrUpdateUser } from "@app/lib/iam/users";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import mainLogger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { normalizeError } from "@app/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";

const workOS = getWorkOS();

const logger = mainLogger.child(
  {},
  {
    msgPrefix: "[WorkOS Event] ",
  }
);

async function handleOrganizationDomainEvent(
  eventData: OrganizationDomain,
  expectedState: "verified" | "failed"
) {
  const { domain, organizationId, state } = eventData;

  assert(
    state === expectedState,
    `Domain state is not ${expectedState} -- expected ${expectedState} but got ${state}`
  );

  const workspace = await findWorkspaceByWorkOSOrganizationId(organizationId);
  if (!workspace) {
    logger.warn({ organizationId }, "Workspace not found for organization");
    // Skip processing if workspace not found - it likely belongs to another region.
    // This is expected in a multi-region setup. DataDog monitors these warnings
    // and will alert if they occur across all regions.
    return;
  }

  let domainResult: Result<any, Error>;
  if (expectedState === "verified") {
    domainResult = await upsertWorkspaceDomain(workspace, { domain });
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

/**
 * Verify if workspace exist, if it does will call the callback with the found workspace.
 * Otherwise will return undefined
 */
async function verifyWorkOSWorkspace<E extends object, R>(
  organizationId: string | null,
  event: E,
  cb: (workspace: LightWorkspaceType, eventData: E) => R
) {
  if (organizationId === null) {
    return;
  }

  const workspace = await findWorkspaceByWorkOSOrganizationId(organizationId);
  if (!workspace) {
    throw new Error(`Workspace not found for workspace "${organizationId}"`);
  }

  return cb(workspace, event);
}

async function fetchWorkOSUserWithEmail(
  workspace: LightWorkspaceType,
  email?: string | null
) {
  if (email == null) {
    throw new Error("Missing email");
  }

  const workOSUserResponse = await workOS.userManagement.listUsers({
    organizationId: workspace.workOSOrganizationId ?? undefined,
    email,
  });

  const workOSUser = _.first(workOSUserResponse.data);
  if (!workOSUser) {
    throw new Error(
      `User not found with email "${email}" in workOS for workspace "${workspace.sId}"`
    );
  }

  return workOSUser;
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
      await handleOrganizationDomainVerified(eventPayload.data);
      break;

    case "organization_domain.verification_failed":
      await handleOrganizationDomainVerificationFailed(eventPayload.data);
      break;

    case "dsync.group.created":
    case "dsync.group.updated":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
        GroupResource.upsertByWorkOSGroupId
      );
      break;

    case "dsync.group.deleted":
      await verifyWorkOSWorkspace(
        eventPayload.data.organizationId,
        eventPayload.data,
        GroupResource.deleteByWorkOSGroupId
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

async function handleOrganizationDomainVerified(eventData: OrganizationDomain) {
  await handleOrganizationDomainEvent(eventData, "verified");
}

async function handleOrganizationDomainVerificationFailed(
  eventData: OrganizationDomain
) {
  await handleOrganizationDomainEvent(eventData, "failed");
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

async function handleUserAddedToGroup(
  workspace: LightWorkspaceType,
  event: DsyncGroupUserAddedEvent["data"]
) {
  if (!event.user.email) {
    logger.warn("Try to 'dsync.group.user_added' without an email");
    return;
  }

  const workOSUser = await fetchWorkOSUserWithEmail(
    workspace,
    event.user.email
  );

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

  const res = await group.addMember(auth, user.toJSON());
  if (res.isErr()) {
    logger.error(normalizeError(res.error));
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

  const workOSUser = await fetchWorkOSUserWithEmail(
    workspace,
    event.user.email
  );

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

  const res = await group.removeMember(auth, user.toJSON());
  if (res.isErr()) {
    logger.error(normalizeError(res.error));
  }
}

async function handleCreateOrUpdateWorkOSUser(
  workspace: LightWorkspaceType,
  event: DirectoryUser
) {
  const workOSUser = await fetchWorkOSUserWithEmail(workspace, event.email);

  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  const externalUser: ExternalUser = {
    auth0Sub: null,
    email: workOSUser.email,
    email_verified: true,
    name: workOSUser.email ?? "",
    nickname: getUserNicknameFromEmail(workOSUser.email) ?? "",
    workOSUserId: workOSUser.id,
    picture: workOSUser.profilePictureUrl ?? undefined,
  };

  const { user: createdOrUpdatedUser } = await createOrUpdateUser({
    user,
    externalUser,
  });
  await MembershipResource.createMembership({
    user: createdOrUpdatedUser,
    workspace,
    role: "user",
  });
}

async function handleDeleteWorkOSUser(
  workspace: LightWorkspaceType,
  event: DirectoryUser
) {
  const workOSUser = await fetchWorkOSUserWithEmail(workspace, event.email);

  const user = await UserResource.fetchByWorkOSUserId(workOSUser.id);
  if (!user) {
    throw new Error(
      `Didn't found user to delete for workOSUserId "${workOSUser.id}" in workspace "${workspace.sId}"`
    );
  }

  await MembershipResource.revokeMembership({ user, workspace });
}
