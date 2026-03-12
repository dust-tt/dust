import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectType } from "@app/types/space";

export async function enrichProjectsWithMetadata(
  auth: Authenticator,
  spaces: SpaceResource[]
): Promise<Array<ProjectType & { isMember: boolean }>> {
  if (spaces.length === 0) {
    return [];
  }

  const spaceIds = spaces.map((s) => s.id);

  const metadatas = await ProjectMetadataResource.fetchBySpaceIds(
    auth,
    spaceIds
  );
  const metadataMap = new Map<number, ProjectMetadataResource>(
    metadatas.map((m) => [m.spaceId, m])
  );

  return spaces.map((space) => ({
    ...space.toJSON(),
    description: metadataMap.get(space.id)?.description ?? null,
    isMember: space.isMember(auth),
    archivedAt: metadataMap.get(space.id)?.archivedAt?.getTime() ?? null,
  }));
}
