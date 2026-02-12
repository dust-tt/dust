import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import type { ModelId } from "@app/types/shared/model_id";
import type { ProjectType } from "@app/types/space";

export async function enrichProjectsWithMetadata(
  auth: Authenticator,
  spaces: SpaceResource[]
): Promise<Array<ProjectType & { isMember: boolean }>> {
  if (spaces.length === 0) {
    return [];
  }

  const workspaceId = auth.getNonNullableWorkspace().id;
  const spaceIds = spaces.map((s) => s.id);

  const records = await ProjectMetadataModel.findAll({
    where: {
      spaceId: { [Op.in]: spaceIds },
      workspaceId,
    },
  });

  const metadataMap = new Map<ModelId, string | null>();
  for (const pm of records) {
    metadataMap.set(pm.spaceId, pm.description);
  }

  return spaces.map((space) => ({
    ...space.toJSON(),
    description: metadataMap.get(space.id) ?? null,
    isMember: space.isMember(auth),
  }));
}
