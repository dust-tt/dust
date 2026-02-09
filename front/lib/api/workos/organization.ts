import type { Connection, Directory, Organization } from "@workos-inc/node";
import {
  DomainDataState,
  GeneratePortalLinkIntent,
  OrganizationDomainState,
} from "@workos-inc/node";
import assert from "assert";
import uniqueId from "lodash/uniqueId";

import { config } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import { getWorkOSOrganization } from "@app/lib/api/workos/organization_primitives";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function getOrCreateWorkOSOrganization(
  workspace: LightWorkspaceType,
  { domain }: { domain?: string } = {}
): Promise<Result<Organization, Error>> {
  try {
    const organizationRes = await getWorkOSOrganization(workspace);
    if (organizationRes.isErr()) {
      return new Err(organizationRes.error);
    }

    let organization = organizationRes.value;
    if (!organization) {
      organization = await getWorkOS().organizations.createOrganization({
        name: workspace.name,
        externalId: workspace.sId,
        metadata: {
          region: config.getCurrentRegion(),
        },
        domainData: domain
          ? [
              {
                domain,
                state: DomainDataState.Verified,
              },
            ]
          : undefined,
      });

      const { memberships } =
        await MembershipResource.getMembershipsForWorkspace({
          workspace,
          includeUser: true,
        });

      await concurrentExecutor(
        memberships,
        async (membership) => {
          const user = membership.user;
          if (!user || !user.workOSUserId || !organization) {
            return;
          }

          await getWorkOS().userManagement.createOrganizationMembership({
            userId: user.workOSUserId,
            organizationId: organization.id,
            roleSlug: membership.role,
          });

          await invalidateWorkOSOrganizationsCacheForUserId(user.workOSUserId);
        },
        { concurrency: 10 }
      );
    }

    await WorkspaceResource.updateWorkOSOrganizationId(
      workspace.id,
      organization.id
    );

    return new Ok(organization);
  } catch (error) {
    const e = normalizeError(error);
    logger.error(e, "Failed to create WorkOS organization");
    return new Err(
      new Error(`Failed to create WorkOS organization: ${e.message}`)
    );
  }
}

export async function addWorkOSOrganizationDomain(
  workspace: LightWorkspaceType,
  { domain }: { domain: string }
): Promise<Result<void, Error>> {
  const organizationRes = await getWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    return new Err(organizationRes.error);
  }

  const organization = organizationRes.value;
  if (!organization) {
    return new Err(
      new Error("WorkOS organization not found for this workspace.")
    );
  }

  await getWorkOS().organizations.updateOrganization({
    organization: organization.id,
    domainData: [
      ...organization.domains.map((d) => ({
        domain: d.domain,
        state:
          d.state === OrganizationDomainState.Verified
            ? DomainDataState.Verified
            : DomainDataState.Pending,
      })),
      {
        domain,
        state: DomainDataState.Verified,
      },
    ],
  });

  // WARN: Hacky update done after the domain data, so that it trigger
  // the webhook. Should be remove once WorkOS send us webhook when just
  // the domains change.
  await getWorkOS().organizations.updateOrganization({
    organization: organization.id,
    metadata: {
      _webhookTrigger: uniqueId(),
    },
  });

  return new Ok(undefined);
}

export async function updateWorkOSOrganizationName(
  workspace: LightWorkspaceType
): Promise<Result<void, Error>> {
  const organizationRes = await getWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    return new Err(organizationRes.error);
  }

  const organization = organizationRes.value;
  if (!organization) {
    return new Ok(undefined);
  }

  const newName = workspace.name;

  if (organization.name === newName) {
    return new Ok(undefined);
  }

  try {
    await getWorkOS().organizations.updateOrganization({
      organization: organization.id,
      name: newName,
    });
  } catch (error) {
    const e = normalizeError(error);
    logger.error("Failed to update WorkOS organization name", {
      error: e,
      workspaceId: workspace.id,
      organizationId: organization.id,
    });
    return new Ok(undefined);
  }

  return new Ok(undefined);
}

// Mapping WorkOSPortalIntent to GeneratePortalLinkIntent,
// as we can't use the WorkOSPortalIntent enum on any Client-Side code.
const INTENT_MAP: Record<WorkOSPortalIntent, GeneratePortalLinkIntent> = {
  [WorkOSPortalIntent.SSO]: GeneratePortalLinkIntent.SSO,
  [WorkOSPortalIntent.DSync]: GeneratePortalLinkIntent.DSync,
  [WorkOSPortalIntent.DomainVerification]:
    GeneratePortalLinkIntent.DomainVerification,
  [WorkOSPortalIntent.AuditLogs]: GeneratePortalLinkIntent.AuditLogs,
  [WorkOSPortalIntent.LogStreams]: GeneratePortalLinkIntent.LogStreams,
  [WorkOSPortalIntent.CertificateRenewal]:
    GeneratePortalLinkIntent.CertificateRenewal,
};

export function generateWorkOSAdminPortalUrl({
  organization,
  workOSIntent,
  returnUrl,
}: {
  organization: string;
  workOSIntent: WorkOSPortalIntent;
  returnUrl: string;
}) {
  const intent = INTENT_MAP[workOSIntent];

  if (!intent) {
    throw new Error(`Invalid intent: ${workOSIntent}`);
  }

  return getWorkOS().portal.generateLink({
    organization,
    intent,
    returnUrl,
  });
}

/**
 * SSO Connections.
 */

export async function getWorkOSOrganizationSSOConnections({
  workspace,
}: {
  workspace: LightWorkspaceType;
}): Promise<Result<Connection[], Error>> {
  assert(workspace.workOSOrganizationId, "WorkOS organization should exist");

  try {
    const { data: connections } = await getWorkOS().sso.listConnections({
      organizationId: workspace.workOSOrganizationId,
    });

    return new Ok(connections);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteWorkOSOrganizationSSOConnection(
  connection: Connection
): Promise<Result<void, Error>> {
  try {
    await getWorkOS().sso.deleteConnection(connection.id);

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Directory Sync.
 */

export async function getWorkOSOrganizationDSyncDirectories({
  workspace,
}: {
  workspace: LightWorkspaceType;
}): Promise<Result<Directory[], Error>> {
  if (!workspace.workOSOrganizationId) {
    return new Err(
      new Error("WorkOS organization not found for this workspace.")
    );
  }

  try {
    const { data: directories } =
      await getWorkOS().directorySync.listDirectories({
        organizationId: workspace.workOSOrganizationId,
      });

    return new Ok(directories);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteWorkOSOrganizationDSyncConnection(
  directory: Directory
): Promise<Result<void, Error>> {
  try {
    await getWorkOS().directorySync.deleteDirectory(directory.id);

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Disables SSO and/or SCIM for a workspace by deleting WorkOS SSO connections
 * and/or SCIM directories, and disabling SSO enforcement.
 * Called when a workspace downgrades to a plan that doesn't allow SSO/SCIM.
 */
export async function disableWorkOSSSOAndSCIM(
  workspace: LightWorkspaceType,
  { disableSSO, disableSCIM }: { disableSSO: boolean; disableSCIM: boolean }
): Promise<void> {
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    workOSOrganizationId: workspace.workOSOrganizationId,
  });

  if (!workspace.workOSOrganizationId) {
    localLogger.info("No WorkOS organization, skipping SSO/SCIM cleanup");
    return;
  }

  if (disableSSO) {
    // Delete all SSO connections.
    const connectionsRes = await getWorkOSOrganizationSSOConnections({
      workspace,
    });
    if (connectionsRes.isOk()) {
      for (const connection of connectionsRes.value) {
        const deleteRes =
          await deleteWorkOSOrganizationSSOConnection(connection);
        if (deleteRes.isErr()) {
          localLogger.error(
            { connectionId: connection.id, error: deleteRes.error },
            "Failed to delete SSO connection"
          );
        } else {
          localLogger.info(
            { connectionId: connection.id },
            "Deleted SSO connection"
          );
        }
      }
    } else {
      localLogger.error(
        { error: connectionsRes.error },
        "Failed to list SSO connections"
      );
    }

    // Disable SSO enforcement.
    const disableRes = await WorkspaceResource.disableSSOEnforcement(
      workspace.id
    );
    if (disableRes.isErr()) {
      localLogger.error(
        { error: disableRes.error },
        "Failed to disable SSO enforcement"
      );
    } else {
      localLogger.info("Disabled SSO enforcement");
    }
  }

  if (disableSCIM) {
    // Delete all SCIM directories.
    const directoriesRes = await getWorkOSOrganizationDSyncDirectories({
      workspace,
    });
    if (directoriesRes.isOk()) {
      for (const directory of directoriesRes.value) {
        const deleteRes =
          await deleteWorkOSOrganizationDSyncConnection(directory);
        if (deleteRes.isErr()) {
          localLogger.error(
            { directoryId: directory.id, error: deleteRes.error },
            "Failed to delete SCIM directory"
          );
        } else {
          localLogger.info(
            { directoryId: directory.id },
            "Deleted SCIM directory"
          );
        }
      }
    } else {
      localLogger.error(
        { error: directoriesRes.error },
        "Failed to list SCIM directories"
      );
    }
  }
}

export async function deleteWorksOSOrganizationWithWorkspace(
  workspaceId: string
): Promise<Result<undefined, Error>> {
  const localLogger = logger.child({
    workspaceId,
  });

  let organization: Organization;
  try {
    organization =
      await getWorkOS().organizations.getOrganizationByExternalId(workspaceId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    localLogger.warn({ workspaceId }, "Can't get workOSOrganization");
    return new Ok(undefined);
  }

  try {
    await getWorkOS().organizations.deleteOrganization(organization.id);

    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
