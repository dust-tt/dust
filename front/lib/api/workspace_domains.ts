import {
  listWorkOSOrganizationsWithDomain,
  removeWorkOSOrganizationDomain,
  removeWorkOSOrganizationDomainFromOrganization,
} from "@app/lib/api/workos/organization";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result, WorkspaceDomain } from "@app/types";
import { Err, Ok } from "@app/types";

export async function upsertWorkspaceDomain(
  workspace: LightWorkspaceType,
  {
    domain,
    dropExistingDomain = false,
  }: { domain: string; dropExistingDomain?: boolean }
): Promise<Result<WorkspaceHasDomainModel, Error>> {
  const existingDomainInRegion = await WorkspaceHasDomainModel.findOne({
    where: { domain },
    include: [
      {
        model: WorkspaceModel,
        as: "workspace",
        required: true,
      },
    ],
  });

  if (
    existingDomainInRegion &&
    existingDomainInRegion.workspace.id === workspace.id
  ) {
    return new Ok(existingDomainInRegion);
  }

  if (existingDomainInRegion) {
    if (dropExistingDomain) {
      logger.info(
        {
          domain,
          workspaceId: existingDomainInRegion.workspace.id,
        },
        "Dropping existing domain"
      );

      const { workspace } = existingDomainInRegion;

      // Delete the domain from the DB.
      await existingDomainInRegion.destroy();

      // Delete the domain from WorkOS.
      await removeWorkOSOrganizationDomain(
        renderLightWorkspaceType({ workspace }),
        {
          domain,
        }
      );
    } else {
      return new Err(
        new Error(
          `Domain ${domain} already exists in workspace ${existingDomainInRegion.workspace.id}`
        )
      );
    }
  }

  // Ensure the domain is not already in use by another workspace in another region.
  const organizationsWithDomain =
    await listWorkOSOrganizationsWithDomain(domain);

  if (organizationsWithDomain.length > 0) {
    const otherOrganizationsWithDomain = organizationsWithDomain.filter(
      (o) => o.id !== workspace.workOSOrganizationId
    );

    const [otherOrganizationWithDomain] = otherOrganizationsWithDomain;
    if (otherOrganizationWithDomain) {
      if (dropExistingDomain) {
        logger.info(
          {
            domain,
            organizationId: otherOrganizationWithDomain.id,
          },
          "Dropping existing domain"
        );

        // Delete the domain from WorkOS.
        await removeWorkOSOrganizationDomainFromOrganization(
          otherOrganizationWithDomain,
          {
            domain,
          }
        );
      } else {
        return new Err(
          new Error(
            `Domain ${domain} already associated with organization ` +
              `${otherOrganizationWithDomain.id} - ${otherOrganizationWithDomain.metadata.region}`
          )
        );
      }
    }
  }

  const d = await WorkspaceHasDomainModel.create({
    domain,
    domainAutoJoinEnabled: false,
    workspaceId: workspace.id,
  });

  return new Ok(d);
}

export async function deleteWorkspaceDomain(
  workspace: LightWorkspaceType,
  { domain }: { domain: string }
): Promise<Result<void, Error>> {
  const existingDomain = await WorkspaceHasDomainModel.findOne({
    where: {
      domain,
      workspaceId: workspace.id,
    },
  });

  if (!existingDomain) {
    return new Err(
      new Error(`Domain ${domain} not found for workspace ${workspace.sId}`)
    );
  }

  await existingDomain.destroy();

  return new Ok(undefined);
}

export async function getWorkspaceVerifiedDomains(
  workspace: LightWorkspaceType
): Promise<WorkspaceDomain[]> {
  const workspaceDomains = await WorkspaceHasDomainModel.findAll({
    attributes: ["domain", "domainAutoJoinEnabled"],
    where: {
      workspaceId: workspace.id,
    },
  });

  if (workspaceDomains) {
    return workspaceDomains.map((domain) => ({
      domain: domain.domain,
      domainAutoJoinEnabled: domain.domainAutoJoinEnabled,
    }));
  }

  return [];
}
