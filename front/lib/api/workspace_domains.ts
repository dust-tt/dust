import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
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
  const existingDomain = await WorkspaceHasDomainModel.findOne({
    where: { domain },
    include: [
      {
        model: WorkspaceModel,
        as: "workspace",
        required: true,
      },
    ],
  });

  if (existingDomain && existingDomain.workspace.id === workspace.id) {
    return new Ok(existingDomain);
  }

  if (existingDomain) {
    if (dropExistingDomain) {
      logger.info(
        {
          domain,
          workspaceId: existingDomain.workspace.id,
        },
        "Dropping existing domain"
      );

      await existingDomain.destroy();
    } else {
      return new Err(
        new Error(
          `Domain ${domain} already exists in workspace ${existingDomain.workspace.id}`
        )
      );
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
