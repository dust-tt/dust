import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import type { LightWorkspaceType, Result, WorkspaceDomain } from "@app/types";
import { Err, Ok } from "@app/types";

export async function upsertWorkspaceDomain(
  workspace: LightWorkspaceType,
  { domain }: { domain: string }
): Promise<Result<WorkspaceHasDomainModel, Error>> {
  const existingDomain = await WorkspaceHasDomainModel.findOne({
    where: { domain },
    include: [
      {
        model: Workspace,
        as: "workspace",
        required: true,
      },
    ],
  });

  if (existingDomain && existingDomain.workspace.id === workspace.id) {
    return new Ok(existingDomain);
  }

  if (existingDomain) {
    return new Err(
      new Error(
        `Domain ${domain} already exists in workspace ${existingDomain.workspace.id}`
      )
    );
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
