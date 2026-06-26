import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { removeDiacritics } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { SearchProjectsResponseBody } from "@app/types/api/projects/list";
import type { PodType, SpaceType } from "@app/types/space";

export type ListPodsAccess = "member" | "open";

export type ListPodsPagination = {
  limit: number;
  pageOffset: number;
};

export type ListPodsForScopeResult = {
  pods: SpaceResource[];
  total: number;
  hasMore: boolean;
};

function podNameMatches(q: string | undefined, podName: string): boolean {
  const normalizedQuery = removeDiacritics(q?.trim() ?? "").toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return removeDiacritics(podName).toLowerCase().includes(normalizedQuery);
}

function sortPodsByName(pods: SpaceResource[]): SpaceResource[] {
  return [...pods].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/**
 * Paginated search over readable Pods. Used by the sidebar Pod browse popover
 * (`useSearchPods` → `GET /spaces/search_projects`).
 */
export async function searchReadablePods(
  auth: Authenticator,
  {
    query,
    pagination,
  }: {
    query?: string;
    pagination: {
      limit: number;
      lastValue?: string;
      orderDirection: "asc" | "desc";
    };
  }
): Promise<SearchProjectsResponseBody> {
  const {
    spaces: projectSpaces,
    hasMore,
    lastValue,
  } = await SpaceResource.searchProjectsByNamePaginated(auth, {
    query,
    pagination,
  });

  const projectsWithMetadata = await enrichProjectsWithMetadata(
    auth,
    projectSpaces
  );
  const metadataMap = new Map(projectsWithMetadata.map((p) => [p.sId, p]));

  const results = [];
  for (const space of projectSpaces) {
    const metadata = metadataMap.get(space.sId);
    if (!metadata) {
      logger.warn({ spaceId: space.sId }, "Missing metadata for project");
      continue;
    }
    results.push({ ...metadata, isMember: space.isMember(auth) });
  }

  return {
    spaces: results,
    hasMore,
    lastValue,
  };
}

/**
 * List non-archived Pods for the given scope, with optional diacritics-insensitive
 * name filtering and offset-based pagination.
 *
 * - member: Pods where the user is a space member (sidebar default).
 * - open: all non-archived open Pods in the workspace (via searchProjectsByNamePaginated).
 */
export async function listPodsForScope(
  auth: Authenticator,
  {
    access,
    q,
    pagination,
  }: {
    access: ListPodsAccess;
    q?: string;
    pagination: ListPodsPagination;
  }
): Promise<ListPodsForScopeResult> {
  const { limit, pageOffset } = pagination;

  if (access === "member") {
    const { nonArchivedSpaces } =
      await listNonArchivedMemberSpacesWithMetadata(auth);
    const memberPods = nonArchivedSpaces.filter((space) => space.isProject());
    const matchingPods = memberPods.filter((pod) =>
      podNameMatches(q, pod.name)
    );
    const sortedPods = sortPodsByName(matchingPods);
    const total = sortedPods.length;
    const pods = sortedPods.slice(pageOffset, pageOffset + limit);

    return {
      pods,
      total,
      hasMore: pageOffset + pods.length < total,
    };
  }

  const pagePods: SpaceResource[] = [];
  let total = 0;
  let lastValue: string | undefined;
  let hasMoreSearch = true;

  while (hasMoreSearch) {
    const page = await SpaceResource.searchProjectsByNamePaginated(auth, {
      pagination: {
        limit,
        lastValue,
        orderDirection: "asc",
      },
    });

    const metadatas = await ProjectMetadataResource.fetchBySpaceIds(
      auth,
      page.spaces.map((space) => space.id)
    );
    const metadataMap = new Map(metadatas.map((m) => [m.spaceId, m]));

    for (const space of page.spaces) {
      if (
        space.isOpen() &&
        metadataMap.get(space.id)?.archivedAt === null &&
        podNameMatches(q, space.name)
      ) {
        if (total >= pageOffset && pagePods.length < limit) {
          pagePods.push(space);
        }
        total++;
      }
    }

    hasMoreSearch = page.hasMore;
    lastValue = page.lastValue ?? undefined;
  }

  return {
    pods: pagePods,
    total,
    hasMore: pageOffset + pagePods.length < total,
  };
}

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
