import {
  listWorkOSOrganizationsWithDomain,
  removeWorkOSOrganizationDomain,
} from "@app/lib/api/workos/organization";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result, WorkspaceDomain } from "@app/types";
import { Err, Ok } from "@app/types";
import type { DomainUseCase } from "@app/types/domain";

export async function upsertWorkspaceDomain(
  workspace: LightWorkspaceType,
  {
    domain,
    dropExistingDomain = false,
    initialUseCases = ["sso"],
  }: {
    domain: string;
    dropExistingDomain?: boolean;
    initialUseCases?: DomainUseCase[];
  }
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
      return new Err(
        new Error(
          `Domain ${domain} already associated with organization ` +
            `${otherOrganizationWithDomain.id} - ${otherOrganizationWithDomain.metadata.region}`
        )
      );
    }
  }

  const d = await WorkspaceHasDomainModel.create({
    domain,
    domainAutoJoinEnabled: false,
    useCases: initialUseCases,
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
  workspace: LightWorkspaceType,
  { useCase }: { useCase?: DomainUseCase } = {}
): Promise<WorkspaceDomain[]> {
  const workspaceDomains = await WorkspaceHasDomainModel.findAll({
    attributes: ["domain", "domainAutoJoinEnabled", "useCases"],
    where: {
      workspaceId: workspace.id,
    },
  });

  if (!workspaceDomains) {
    return [];
  }

  let domains = workspaceDomains.map((d) => ({
    domain: d.domain,
    domainAutoJoinEnabled: d.domainAutoJoinEnabled,
    useCases: d.useCases,
  }));

  // Filter by use case if specified.
  if (useCase) {
    domains = domains.filter((d) => d.useCases.includes(useCase));
  }

  return domains;
}

/**
 * Add a use case to an already-verified domain. The domain must already exist
 * for this workspace. This allows enabling additional use cases without
 * re-verifying the domain.
 */
export async function addUseCaseToDomain(
  workspace: LightWorkspaceType,
  { domain, useCase }: { domain: string; useCase: DomainUseCase }
): Promise<Result<WorkspaceDomain, Error>> {
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

  // Check if use case is already enabled.
  if (existingDomain.useCases.includes(useCase)) {
    return new Ok({
      domain: existingDomain.domain,
      domainAutoJoinEnabled: existingDomain.domainAutoJoinEnabled,
      useCases: existingDomain.useCases,
    });
  }

  // Add the new use case.
  const newUseCases = [...existingDomain.useCases, useCase];
  await existingDomain.update({ useCases: newUseCases });

  logger.info(
    { domain, useCase, workspaceId: workspace.sId },
    "Added use case to domain"
  );

  return new Ok({
    domain: existingDomain.domain,
    domainAutoJoinEnabled: existingDomain.domainAutoJoinEnabled,
    useCases: newUseCases,
  });
}

/**
 * Remove a use case from a domain. If no use cases remain, the domain is
 * deleted entirely.
 */
export async function removeUseCaseFromDomain(
  workspace: LightWorkspaceType,
  { domain, useCase }: { domain: string; useCase: DomainUseCase }
): Promise<Result<WorkspaceDomain | null, Error>> {
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

  // Check if use case is enabled.
  if (!existingDomain.useCases.includes(useCase)) {
    return new Ok({
      domain: existingDomain.domain,
      domainAutoJoinEnabled: existingDomain.domainAutoJoinEnabled,
      useCases: existingDomain.useCases,
    });
  }

  const newUseCases = existingDomain.useCases.filter((uc) => uc !== useCase);

  // If no use cases remain, delete the domain entirely.
  if (newUseCases.length === 0) {
    await existingDomain.destroy();
    logger.info(
      { domain, workspaceId: workspace.sId },
      "Deleted domain after removing last use case"
    );
    return new Ok(null);
  }

  await existingDomain.update({ useCases: newUseCases });

  logger.info(
    { domain, useCase, workspaceId: workspace.sId },
    "Removed use case from domain"
  );

  return new Ok({
    domain: existingDomain.domain,
    domainAutoJoinEnabled: existingDomain.domainAutoJoinEnabled,
    useCases: newUseCases,
  });
}

/**
 * Update all use cases for a domain at once.
 */
export async function updateDomainUseCases(
  workspace: LightWorkspaceType,
  { domain, useCases }: { domain: string; useCases: DomainUseCase[] }
): Promise<Result<WorkspaceDomain | null, Error>> {
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

  // If no use cases provided, delete the domain.
  if (useCases.length === 0) {
    await existingDomain.destroy();
    logger.info(
      { domain, workspaceId: workspace.sId },
      "Deleted domain after setting empty use cases"
    );
    return new Ok(null);
  }

  await existingDomain.update({ useCases });

  logger.info(
    { domain, useCases, workspaceId: workspace.sId },
    "Updated domain use cases"
  );

  return new Ok({
    domain: existingDomain.domain,
    domainAutoJoinEnabled: existingDomain.domainAutoJoinEnabled,
    useCases,
  });
}

/**
 * Check if a domain supports a specific use case for a workspace.
 */
export async function domainSupportsUseCase(
  workspace: LightWorkspaceType,
  { domain, useCase }: { domain: string; useCase: DomainUseCase }
): Promise<boolean> {
  const existingDomain = await WorkspaceHasDomainModel.findOne({
    where: {
      domain,
      workspaceId: workspace.id,
    },
  });

  if (!existingDomain) {
    return false;
  }

  return existingDomain.useCases.includes(useCase);
}
