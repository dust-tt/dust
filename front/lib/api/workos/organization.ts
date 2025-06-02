import type { Connection, Directory, Organization } from "@workos-inc/node";
import { DomainDataState, GeneratePortalLinkIntent } from "@workos-inc/node";

import { getWorkOS } from "@app/lib/api/workos/client";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { PlanType, Result, WorkspaceType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function getWorkOSOrganization({
  workspace,
  domain,
}: {
  workspace: WorkspaceType;
  domain: WorkspaceHasDomainModel;
}): Promise<Organization> {
  try {
    const result = await getWorkOS().organizations.getOrganizationByExternalId(
      workspace.sId
    );

    return result;
  } catch (error) {
    return getWorkOS().organizations.createOrganization({
      name: `${workspace.name} - ${workspace.sId}`,
      externalId: workspace.sId,
      domainData: [
        {
          domain: domain.domain,
          state: DomainDataState.Verified,
        },
      ],
    });
  }
}

export async function shouldCreateWorkOSOrganization(
  workspace: WorkspaceType,
  plan: PlanType
): Promise<
  | { shouldCreate: false; domain: undefined }
  | { shouldCreate: true; domain: WorkspaceHasDomainModel }
> {
  if (workspace.workOSOrganizationId) {
    return { shouldCreate: false, domain: undefined };
  }

  if (!plan.limits.isWorkOSAllowed) {
    return { shouldCreate: false, domain: undefined };
  }

  const domain = await WorkspaceHasDomainModel.findOne({
    where: {
      workspaceId: workspace.id,
    },
  });

  if (!domain) {
    return { shouldCreate: false, domain: undefined };
  }

  return {
    shouldCreate: true,
    domain,
  };
}

export async function createOrGetWorkOSOrganization({
  workspace,
  domain,
}: {
  workspace: WorkspaceType;
  domain: WorkspaceHasDomainModel;
}): Promise<Result<Organization, Error>> {
  try {
    const organization = await getWorkOSOrganization({ workspace, domain });

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
  workspace: WorkspaceType;
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
  workspace: WorkspaceType;
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
