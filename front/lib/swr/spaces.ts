import { useSendNotification } from "@app/hooks/useNotification";
import type {
  CursorPaginationParams,
  SortingParams,
} from "@app/lib/api/pagination";
import type {
  PatchSpaceMembersRequestBodyType,
  PostSpaceMembersRequestBodyType,
} from "@app/lib/api/spaces/members";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { clientFetch } from "@app/lib/egress/client";
import { getSpaceName } from "@app/lib/spaces";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetDataSourceViewResponseBody,
  GetSpaceDataSourceViewsResponseBody,
} from "@app/types/api/data_source_view";
import type { PostSpaceDataSourceResponseBody } from "@app/types/api/data_sources";
import type { GetKeyScopableSpacesResponseBody } from "@app/types/api/keys";
import type { SpacesLookupResponseBody } from "@app/types/api/projects/list";
import type { DataSourceViewCategoryWithoutApps } from "@app/types/api/public/spaces";
import type {
  DataSourceContentNode,
  PostWorkspaceSearchResponseBody,
} from "@app/types/api/search";
import type {
  GetSpaceResponseBody,
  GetSpacesAccessCheckResponseBody,
  GetSpacesResponseBody,
  PatchSpaceResponseBody,
  PostSpaceRequestBodyType,
  PostSpacesResponseBody,
  SpaceUsersWithoutAccess,
} from "@app/types/api/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { SearchWarningCode } from "@app/types/core/core_api";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type {
  EnrichedSpaceType,
  PodType,
  SpaceKind,
  SpaceType,
} from "@app/types/space";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher, KeyedMutator, SWRConfiguration } from "swr";

export function useSpaces({
  workspaceId,
  kinds,
  disabled,
  swrOptions,
}: {
  workspaceId: string;
  kinds: SpaceKind[] | "all";
  disabled?: boolean;
  swrOptions?: SWRConfiguration;
}) {
  const { fetcher } = useFetcher();
  const spacesFetcher: Fetcher<GetSpacesResponseBody> = fetcher;
  const queryParams =
    kinds === "all"
      ? ""
      : `?${kinds
          .toSorted()
          .map((kind) => `kind=${encodeURIComponent(kind)}`)
          .join("&")}`;

  const { data, error, mutateRegardlessOfQueryParams } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces${queryParams}`,
    spacesFetcher,
    { ...swrOptions, disabled }
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const spaces = useMemo(() => {
    return (
      data?.spaces?.filter((s) => kinds === "all" || kinds.includes(s.kind)) ??
      emptyArray<EnrichedSpaceType | PodType>()
    );
    // Serialize the kinds array to a string to avoid unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.spaces, kinds === "all" ? kinds : kinds.toSorted().join(",")]);

  return {
    spaces,
    isSpacesLoading: !error && !data && !disabled,
    isSpacesError: error,
    mutate: mutateRegardlessOfQueryParams,
  };
}

export function useSpaceProjectsLookup({
  workspaceId,
  spaceIds,
  disabled,
}: {
  workspaceId: string;
  spaceIds: string[];
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const spacesLookupFetcher: Fetcher<SpacesLookupResponseBody> = fetcher;

  const query =
    spaceIds.length > 0
      ? `/api/w/${workspaceId}/spaces/projects-lookup?${spaceIds
          .map((id) => `ids=${encodeURIComponent(id)}`)
          .join("&")}`
      : null;

  const { data, error, mutate } = useSWRWithDefaults(
    query,
    spacesLookupFetcher,
    { disabled: disabled ?? spaceIds.length === 0 }
  );

  const spaces = useMemo(() => {
    if (!data?.spaces) {
      return emptyArray<PodType>();
    }
    return data.spaces;
  }, [data?.spaces]);

  return {
    spaces,
    isSpacesLookupLoading: !error && !data && !!query && !disabled,
    isSpacesLookupError: !!error,
    mutate,
  };
}

/**
 * For each of `spaceIds`, which of `userIds` are not members of it — i.e. cannot
 * read what the space holds. The endpoint errors out on any space the current
 * user cannot read, so callers should only pass spaces they already display.
 */
export function useSpacesAccessCheck({
  workspaceId,
  spaceIds,
  userIds,
  disabled,
}: {
  workspaceId: string;
  spaceIds: string[];
  userIds: string[];
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const accessCheckFetcher: Fetcher<GetSpacesAccessCheckResponseBody> = fetcher;

  const isEmpty = spaceIds.length === 0 || userIds.length === 0;
  const params = new URLSearchParams();
  // Sorted so that the same sets always produce the same key, whatever the caller's order.
  for (const spaceId of [...spaceIds].sort()) {
    params.append("spaceIds", spaceId);
  }
  for (const userId of [...userIds].sort()) {
    params.append("userIds", userId);
  }

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/access-check?${params.toString()}`,
    accessCheckFetcher,
    { disabled: disabled || isEmpty }
  );

  return {
    spacesAccess: data?.spacesAccess ?? emptyArray<SpaceUsersWithoutAccess>(),
    isSpacesAccessLoading: !error && !data && !disabled && !isEmpty,
    isSpacesAccessError: !!error,
  };
}

// Note that this hook only returns spaces of kind "global", "regular" and "system" (backend enforced).
// The other kinds are left aside as they are not relevant for the admins point of view.
export function useSpacesAsAdmin({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const spacesFetcher: Fetcher<GetSpacesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces?role=admin`,
    spacesFetcher,
    { disabled }
  );

  return {
    spaces: data?.spaces ?? emptyArray(),
    isSpacesLoading: !error && !data && !disabled,
    isSpacesError: error,
    mutate,
  };
}

// The spaces a new API key may be scoped to: the workspace's restricted spaces and pods. Admin
// only — the endpoint that serves it is behind `ensureIsAdmin()`.
export function useKeyScopableSpaces({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const spacesFetcher: Fetcher<GetKeyScopableSpacesResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/keys/spaces`,
    spacesFetcher,
    { disabled }
  );

  return {
    spaces: data?.spaces ?? emptyArray(),
    isSpacesLoading: !error && !data && !disabled,
    isSpacesError: !!error,
  };
}

export function useSpaceInfo({
  workspaceId,
  spaceId,
  disabled,
  includeAllMembers = false,
}: {
  workspaceId: string;
  spaceId: string | null;
  disabled?: boolean;
  includeAllMembers?: boolean;
}) {
  const { fetcher } = useFetcher();
  const spacesCategoriesFetcher: Fetcher<GetSpaceResponseBody> = fetcher;

  const queryParams = includeAllMembers ? "?includeAllMembers=true" : "";
  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/spaces/${spaceId}${queryParams}`,
      spacesCategoriesFetcher,
      {
        disabled: disabled === true || spaceId === null,
      }
    );

  // A partial cache entry can lack `members`; normalize it so consumers don't
  // crash on `members.filter`/`.length`.
  const spaceInfo = useMemo(() => {
    if (!data) {
      return null;
    }
    return data.space.members
      ? data.space
      : { ...data.space, members: emptyArray<SpaceUserType>() };
  }, [data]);

  return {
    spaceInfo,
    canWriteInSpace: data?.space.canWrite ?? false,
    canReadInSpace: data?.space.isMember ?? false,
    mutateSpaceInfo: mutate,
    mutateSpaceInfoRegardlessOfQueryParams: mutateRegardlessOfQueryParams,
    isSpaceInfoLoading: !error && !data && !disabled,
    isSpaceInfoError: error,
  };
}

export function useSpaceDataSourceView({
  dataSourceViewId,
  disabled,
  owner,
  spaceId,
}: {
  dataSourceViewId: string | null;
  disabled?: boolean;
  owner: LightWorkspaceType;
  spaceId: string | null;
}) {
  const { fetcher } = useFetcher();
  const dataSourceViewsFetcher: Fetcher<GetDataSourceViewResponseBody> =
    fetcher;

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${owner.sId}/spaces/${spaceId}/data_source_views/${dataSourceViewId}`,
      dataSourceViewsFetcher,
      { disabled }
    );

  return {
    dataSourceView: data?.dataSourceView,
    connector: data?.connector ?? null,
    isDataSourceViewLoading: !disabled && !error && !data,
    isDataSourceViewError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useSpaceDataSourceViews({
  category,
  disabled,
  spaceId,
  workspaceId,
}: {
  category?: DataSourceViewCategoryWithoutApps;
  disabled?: boolean;
  spaceId: string;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const spacesDataSourceViewsFetcher: Fetcher<
    GetSpaceDataSourceViewsResponseBody<false>
  > = fetcher;

  const queryParams = new URLSearchParams();
  if (category) {
    queryParams.set("category", category);
  }

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/spaces/${spaceId}/data_source_views?${queryParams.toString()}`,
      spacesDataSourceViewsFetcher,
      { disabled }
    );

  return {
    spaceDataSourceViews: data?.dataSourceViews ?? emptyArray(),
    mutate,
    mutateRegardlessOfQueryParams,
    isSpaceDataSourceViewsLoading: !disabled && !error && !data,
    isSpaceDataSourceViewsError: error,
  };
}

export function useSpaceDataSourceViewsWithDetails({
  category,
  disabled,
  spaceId,
  workspaceId,
}: {
  category: DataSourceViewCategoryWithoutApps;
  disabled?: boolean;
  spaceId: string;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const spacesDataSourceViewsFetcher: Fetcher<
    GetSpaceDataSourceViewsResponseBody<true>
  > = fetcher;

  const queryParams = new URLSearchParams();

  queryParams.set("category", category);
  queryParams.set("includeEditedBy", "true");
  queryParams.set("withDetails", "true");

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/spaces/${spaceId}/data_source_views?${queryParams.toString()}`,
      spacesDataSourceViewsFetcher,
      { disabled }
    );

  return {
    spaceDataSourceViews: data?.dataSourceViews ?? emptyArray(),
    mutate,
    mutateRegardlessOfQueryParams,
    isSpaceDataSourceViewsLoading: !error && !data && !disabled,
    isSpaceDataSourceViewsError: error,
  };
}

// Convenient hooks for creating, updating and deleting folders, handle mutations and notifications
export function useCreateFolder({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: spaceId,
      category: "folder",
      disabled: true, // Needed just to mutate
    });

  const doCreate = async (name: string | null, description: string | null) => {
    if (!name) {
      return null;
    }

    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${spaceId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
        }),
      }
    );
    if (res.ok) {
      void mutateSpaceDataSourceViews();
      const response: PostSpaceDataSourceResponseBody = await res.json();
      const { dataSourceView } = response;
      sendNotification({
        type: "success",
        title: "Successfully created folder",
        description: "Folder was successfully created.",
      });
      return dataSourceView;
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Error creating Folder",
        description: `Error: ${errorData.message}`,
      });
      return null;
    }
  };

  return doCreate;
}

export function useUpdateFolder({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();
  const doUpdate = async (
    dataSourceView: DataSourceViewType | null,
    description: string | null
  ) => {
    if (!dataSourceView || !description) {
      return false;
    }
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${spaceId}/data_sources/${dataSourceView.dataSource.sId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
        }),
      }
    );
    if (res.ok) {
      sendNotification({
        type: "success",
        title: "Successfully updated folder",
        description: "Folder was successfully updated.",
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Error updating Folder",
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doUpdate;
}

export function useDeleteFolderOrWebsite({
  owner,
  spaceId,
  category,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  category: DataSourceViewCategoryWithoutApps;
}) {
  const sendNotification = useSendNotification();
  const { mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: spaceId,
      category: category,
      disabled: true, // Needed just to mutate
    });

  const doDelete = async (dataSourceView: DataSourceViewType | undefined) => {
    if (!dataSourceView) {
      return false;
    }
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${spaceId}/data_sources/${dataSourceView.dataSource.sId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      await mutateSpaceDataSourceViews();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${category}`,
        description: `${getDisplayNameForDataSource(dataSourceView.dataSource)} was successfully deleted.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error deleting ${category}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useCreateSpace({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutate: mutateSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: true, // Needed just to mutate.
  });
  const { mutate: mutateSpacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate.
  });

  const doCreate = async (
    params: PostSpaceRequestBodyType,
    notification?: { title: string; description: string }
  ) => {
    const { name, managementMode, isRestricted, spaceKind } = params;

    if (!name) {
      return null;
    }

    const url = `/api/w/${owner.sId}/spaces`;
    let res;
    let body: PostSpaceRequestBodyType;

    if (managementMode === "manual") {
      const { memberIds } = params;

      // Must have memberIds for manual management mode, except for projects
      // where the backend handles adding the creator to the editor group
      if (
        spaceKind !== "project" &&
        isRestricted &&
        (!memberIds || memberIds.length < 1)
      ) {
        return null;
      }

      body = {
        name,
        memberIds,
        managementMode,
        isRestricted,
        spaceKind,
      };

      res = await clientFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } else if (managementMode === "group") {
      const { groupIds } = params;

      // Must have groupIds for group management mode
      if (isRestricted && (!groupIds || groupIds.length < 1)) {
        return null;
      }

      body = {
        name,
        groupIds,
        managementMode,
        isRestricted,
        spaceKind,
      };

      res = await clientFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } else {
      return null;
    }

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Error creating space",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      void mutateSpaces();
      void mutateSpacesAsAdmin();

      sendNotification({
        type: "success",
        title: notification?.title ?? "Successfully created space",
        description:
          notification?.description ?? "Space was successfully created.",
      });

      const response: PostSpacesResponseBody = await res.json();
      return response.space;
    }
  };

  return doCreate;
}

export function useUpdateSpace({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutate: mutateSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateSpacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doUpdate = async (
    space: SpaceType,
    params: PatchSpaceMembersRequestBodyType,
    notification?: { title: string; description: string }
  ) => {
    const { name: newName, managementMode, isRestricted } = params;

    const updatePromises: Promise<Response>[] = [];

    // Prepare space update request.
    if (newName) {
      const spaceUrl = `/api/w/${owner.sId}/spaces/${space.sId}`;
      updatePromises.push(
        clientFetch(spaceUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
          }),
        })
      );
    }

    const spaceMembersUrl = `/api/w/${owner.sId}/spaces/${space.sId}/members`;

    if (managementMode === "manual") {
      updatePromises.push(
        clientFetch(spaceMembersUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
            isRestricted,
            managementMode,
            memberIds: params.memberIds,
            editorIds: params.editorIds,
          } satisfies PatchSpaceMembersRequestBodyType),
        })
      );
    } else if (managementMode === "group") {
      updatePromises.push(
        clientFetch(spaceMembersUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
            isRestricted,
            managementMode,
            groupIds: params.groupIds,
            editorGroupIds: params.editorGroupIds,
          } satisfies PatchSpaceMembersRequestBodyType),
        })
      );
    }

    if (updatePromises.length === 0) {
      return null;
    }

    const results = await Promise.all(updatePromises);

    for (const res of results) {
      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Error updating space",
          description: `Error: ${errorData.message}`,
        });
        return null;
      }
    }
    void mutateSpaces();
    void mutateSpacesAsAdmin();

    sendNotification({
      type: "success",
      title: notification?.title ?? "Successfully updated space",
      description:
        notification?.description ?? "Space was successfully updated.",
    });

    const spaceResponse: PatchSpaceResponseBody = await results[0].json();
    return spaceResponse.space;
  };
  return doUpdate;
}

// Adds members to a manually managed space without replacing its member list.
export function useAddSpaceMembers({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutate: mutateSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateSpacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doAdd = async (
    space: SpaceType,
    memberIds: string[],
    notification?: { title: string; description: string }
  ): Promise<boolean> => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberIds,
        } satisfies PostSpaceMembersRequestBodyType),
      }
    );

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: `Failed to add members to ${getSpaceName(space)}`,
        description: `Error: ${errorData.message}`,
      });
      return false;
    }

    void mutateSpaces();
    void mutateSpacesAsAdmin();

    sendNotification({
      type: "success",
      title: notification?.title ?? "Successfully added members",
      description:
        notification?.description ??
        `Members were added to ${getSpaceName(space)}.`,
    });
    return true;
  };
  return doAdd;
}

export function useDeleteSpace({
  owner,
  force = false,
}: {
  owner: LightWorkspaceType;
  force?: boolean;
}) {
  const sendNotification = useSendNotification();
  const { mutate: mutateSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateSpacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doDelete = async (space: SpaceType | null) => {
    if (!space) {
      return false;
    }
    const url = `/api/w/${owner.sId}/spaces/${space.sId}?force=${force}`;
    const res = await clientFetch(url, {
      method: "DELETE",
    });

    if (res.ok) {
      void mutateSpaces();
      void mutateSpacesAsAdmin();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${getSpaceName(space)}`,
        description: `${getSpaceName(space)} was successfully deleted.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error deleting ${getSpaceName(space)}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useSystemSpace({
  workspaceId,
  disabled = false,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const systemSpaceFetcher: Fetcher<GetSpacesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces?role=admin&kind=system`,
    systemSpaceFetcher,
    { disabled }
  );

  return {
    systemSpace: data ? data.spaces[0] : null,
    isSystemSpaceLoading: !error && !data && !disabled,
    isSystemSpaceError: error,
    mutateSystemSpace: mutate,
  };
}

const DEFAULT_SEARCH_LIMIT = 15;

type BaseSearchParams = {
  disabled?: boolean;
  includeDataSources: boolean;
  owner: LightWorkspaceType;
  spaceIds?: string[];
  viewType: ContentNodesViewType;
  pagination?: CursorPaginationParams;
  searchSort?: SortingParams;
  allowAdminSearch?: boolean;
  dataSourceViewIdsBySpaceId?: Record<string, string[]>;
  parentId?: string;
  prioritizeSpaceAccess?: boolean;
};

// Text search variant
type TextSearchParams = BaseSearchParams & {
  search: string;
  nodeIds?: undefined;
  searchSourceUrls?: boolean;
};

// Node ID search variant
type NodeIdSearchParams = BaseSearchParams & {
  search?: undefined;
  nodeIds: string[];
  searchSourceUrls?: undefined;
};

type SpacesSearchParams = TextSearchParams | NodeIdSearchParams;

export function useSpacesSearch({
  disabled = false,
  includeDataSources = false,
  nodeIds,
  owner,
  search,
  spaceIds,
  viewType,
  pagination,
  searchSort,
  searchSourceUrls = false,
  allowAdminSearch = false,
  dataSourceViewIdsBySpaceId,
  parentId,
  prioritizeSpaceAccess = false,
}: SpacesSearchParams): {
  isSearchLoading: boolean;
  isSearchError: boolean;
  isSearchValidating: boolean;
  mutate: KeyedMutator<PostWorkspaceSearchResponseBody>;
  searchResultNodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
  resultsCount: number | null;
} {
  const { fetcherWithBody } = useFetcher();
  const params = new URLSearchParams();
  if (pagination?.cursor) {
    params.append("cursor", pagination.cursor);
  }
  if (pagination?.limit) {
    params.append("limit", pagination.limit.toString());
  }

  const body = {
    includeDataSources,
    limit: pagination?.limit ?? DEFAULT_SEARCH_LIMIT,
    nodeIds,
    searchSort,
    query: search,
    searchSourceUrls,
    spaceIds,
    viewType,
    allowAdminSearch,
    dataSourceViewIdsBySpaceId,
    parentId,
    prioritizeSpaceAccess,
  };

  // Only perform a query if we have a valid search
  const url =
    (search && search.length >= MIN_SEARCH_QUERY_SIZE) || nodeIds?.length
      ? `/api/w/${owner.sId}/search?${params}`
      : null;

  const fetchKey = JSON.stringify([url + "?" + params.toString(), body]);

  const { data, error, mutate, isValidating, isLoading } = useSWRWithDefaults(
    fetchKey,
    async () => {
      if (!url) {
        return null;
      }

      return fetcherWithBody([url, body, "POST"]);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      disabled,
    }
  );

  return {
    searchResultNodes: data?.nodes ?? emptyArray(),
    isSearchLoading: isLoading,
    isSearchError: error,
    mutate,
    isSearchValidating: isValidating,
    warningCode: data?.warningCode,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    nextPageCursor: data?.nextPageCursor || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    resultsCount: data?.resultsCount || null,
  };
}
