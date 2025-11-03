import type { RegionType } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import type { Logger } from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function updateWorkspaceRegionMetadata(
  auth: Authenticator,
  logger: Logger,
  {
    execute,
    newRegion,
  }: {
    execute: boolean;
    newRegion: RegionType;
  }
): Promise<Result<void, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const organizationRes = await getOrCreateWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    return new Err(organizationRes.error);
  }
  const organization = organizationRes.value;
  if (execute && organization.metadata.region !== newRegion) {
    await getWorkOS().organizations.updateOrganization({
      organization: organization.id,
      metadata: {
        region: newRegion,
      },
    });
  }

  logger.info(
    { newRegion, workspaceId: workspace.sId },
    "Updated workspace region metadata in WorkOS"
  );

  return new Ok(undefined);
}
