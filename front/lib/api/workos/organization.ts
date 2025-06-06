import type { Connection, Directory, Organization } from "@workos-inc/node";
import {
  DomainDataState,
  GeneratePortalLinkIntent,
  OrganizationDomainState,
} from "@workos-inc/node";

import { config } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { Workspace } from "@app/lib/models/workspace";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
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
        name: `${workspace.name} - ${workspace.sId}`,
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
    }

    await Workspace.update(
      {
        workOSOrganizationId: organization.id,
      },
      {
        where: {
          id: workspace.id,
        },
      }
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

export async function getWorkOSOrganizationSSOConnections({
  workspace,
}: {
  workspace: LightWorkspaceType;
}): Promise<Result<Connection[], Error>> {
  if (!workspace.workOSOrganizationId) {
    return new Err(
      new Error("WorkOS organization not found for this workspace.")
    );
  }

  try {
    const { data: directories } = await getWorkOS().sso.listConnections({
      organizationId: workspace.workOSOrganizationId,
    });

    return new Ok(directories);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

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
