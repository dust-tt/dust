import { config } from "@app/lib/api/cells/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import type { Logger } from "@app/logger/logger";
import type { CellType } from "@app/types/cell";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function updateWorkspaceWorkOSMetadata(
  auth: Authenticator,
  logger: Logger,
  {
    execute,
    newCell,
  }: {
    execute: boolean;
    newCell: CellType;
  }
): Promise<Result<void, Error>> {
  const cellInfo = config.getCellInfo(newCell);
  const workspace = auth.getNonNullableWorkspace();

  const organizationRes = await getOrCreateWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    return new Err(organizationRes.error);
  }
  const organization = organizationRes.value;
  if (execute && organization.metadata.cell !== cellInfo.name) {
    await getWorkOS().organizations.updateOrganization({
      organization: organization.id,
      metadata: {
        region: cellInfo.region,
        cell: cellInfo.name,
      },
    });
  }

  logger.info(
    {
      cell: cellInfo.name,
      region: cellInfo.region,
      workspaceId: workspace.sId,
    },
    "Updated workspace metadata in WorkOS"
  );

  return new Ok(undefined);
}
