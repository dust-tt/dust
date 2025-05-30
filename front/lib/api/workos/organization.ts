import type { Connection, Directory } from "@workos-inc/node";
import { DomainDataState, GeneratePortalLinkIntent } from "@workos-inc/node";
import assert from "assert";

import { getWorkOS } from "@app/lib/api/workos/client";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { Result, WorkspaceType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function createWorkOSOrganization({
  workspace,
}: {
  workspace: WorkspaceType;
}): Promise<Result<undefined, Error>> {
  if (workspace.workOSOrganizationId) {
    return new Err(
      new Error("A WorkOS organization already exists for this workspace.")
    );
  }

  const domain = await WorkspaceHasDomainModel.findOne({
    where: {
      workspaceId: workspace.id,
    },
  });
  assert(
    domain,
    "Workspace must have a domain to create a WorkOS organization"
  );

  try {
    const organization = await getWorkOS().organizations.createOrganization({
      name: workspace.name,
      metadata: { workspaceSId: workspace.sId },
      domainData: [
        {
          domain: domain.domain,
          state: DomainDataState.Verified,
        },
      ],
    });

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
  } catch (error) {
    const e = normalizeError(error);
    logger.error(e, "Failed to create WorkOS organization");
    return new Err(
      new Error(`Failed to create WorkOS organization: ${e.message}`)
    );
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
