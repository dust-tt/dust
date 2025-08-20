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
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

function isWorkOSNotFoundEntityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 404 &&
    "code" in error &&
    error.code === "entity_not_found"
  );
}

export async function getWorkOSOrganization(
  workspace: LightWorkspaceType
): Promise<Result<Organization | undefined, Error>> {
  try {
    const result = await getWorkOS().organizations.getOrganizationByExternalId(
      workspace.sId
    );

    return new Ok(result);
  } catch (error) {
    // If the organization is not found, return undefined.
    if (isWorkOSNotFoundEntityError(error)) {
      return new Ok(undefined);
    }

    return new Err(new Error("Failed to get WorkOS organization."));
  }
}

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

export async function removeWorkOSOrganizationDomain(
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
    domainData: organization.domains
      .filter(
        (d) =>
          d.domain !== domain && d.state === OrganizationDomainState.Verified
      )
      .map((d) => ({
        domain: d.domain,
        state: DomainDataState.Verified,
      })),
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

export async function listWorkOSOrganizationsWithDomain(
  domain: string
): Promise<Organization[]> {
  const workOS = getWorkOS();
  const organizations = await workOS.organizations.listOrganizations({
    domains: [domain],
    limit: 100,
  });

  return organizations.data;
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
