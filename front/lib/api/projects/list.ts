import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PodType, SpaceType } from "@app/types/space";

export type SpacesLookupResponseBody = {
  spaces: PodType[];
};

export type SearchProjectsResponseBody = {
  spaces: Array<PodType & { isMember: boolean }>;
  hasMore: boolean;
  lastValue: string | null;
};

/**
 * Spaces the user is a member of, with project metadata loaded, excluding
 * archived projects.
 */
export async function listNonArchivedMemberSpacesWithMetadata(
  auth: Authenticator
): Promise<{
  nonArchivedSpaces: SpaceResource[];
  metadataMap: Map<number, ProjectMetadataResource>;
}> {
  const memberSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const metadatas = await ProjectMetadataResource.fetchBySpaceIds(
    auth,
    memberSpaces.map((s) => s.id)
  );
  const metadataMap = new Map<number, ProjectMetadataResource>(
    metadatas.map((m) => [m.spaceId, m])
  );
  const nonArchivedSpaces = memberSpaces.filter(
    (s) => metadataMap.get(s.id)?.archivedAt === null
  );
  return { nonArchivedSpaces, metadataMap };
}

export async function enrichProjectsWithMetadata(
  auth: Authenticator,
  spaces: SpaceResource[]
): Promise<Array<PodType & { isMember: boolean }>> {
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
    isEditor: space.canAdministrate(auth),
    archivedAt: metadataMap.get(space.id)?.archivedAt?.getTime() ?? null,
  }));
}

export type ProjectWithAdminMetadata = SpaceType & {
  description: string | null;
  archivedAt: number | null;
  todoGenerationEnabled: boolean;
};

/**
 * Every project space in the workspace, with the admin-relevant metadata
 * (description, archived state, todo-generation flag) merged in. Used by the
 * poke admin UI.
 */
export async function listAllProjectsWithAdminMetadata(
  auth: Authenticator
): Promise<ProjectWithAdminMetadata[]> {
  const projectSpaces = await SpaceResource.listProjectSpaces(auth);

  const metadatas = await ProjectMetadataResource.fetchBySpaceIds(
    auth,
    projectSpaces.map((s) => s.id)
  );
  const metadataMap = new Map(metadatas.map((m) => [m.spaceId, m]));

  return projectSpaces.map((space) => {
    const metadata = metadataMap.get(space.id);
    return {
      ...space.toJSON(),
      description: metadata?.description ?? null,
      archivedAt: metadata?.archivedAt?.getTime() ?? null,
      todoGenerationEnabled: metadata?.todoGenerationEnabled ?? false,
    };
  });
}
