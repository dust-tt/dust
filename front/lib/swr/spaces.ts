import { useSpaceConversationsSummary } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  CursorPaginationParams,
  SortingParams,
} from "@app/lib/api/pagination";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { clientFetch } from "@app/lib/egress/client";
import { getSpaceName } from "@app/lib/spaces";
import {
  emptyArray,
  fetcher,
  fetcherWithBody,
  getErrorFromResponse,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  DataSourceContentNode,
  PostWorkspaceSearchResponseBody,
} from "@app/pages/api/w/[wId]/search";
import type {
  GetSpacesResponseBody,
  PostSpaceRequestBodyType,
  PostSpacesResponseBody,
} from "@app/pages/api/w/[wId]/spaces";
import type {
  GetSpaceResponseBody,
  PatchSpaceResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { GetSpaceDataSourceViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views";
import type { GetDataSourceViewResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]";
import type { PostSpaceDataSourceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import type { PatchSpaceMembersRequestBodyType } from "@app/pages/api/w/[wId]/spaces/[spaceId]/members";
import type {
  GetProjectMetadataResponseBody,
  PatchProjectMetadataResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_metadata";
import type { GetUserProjectDigestsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/user_project_digests";
import type { GetDigestGenerationStatusResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/user_project_digests/generate/status";
import type { SpacesLookupResponseBody } from "@app/pages/api/w/[wId]/spaces/projects-lookup";
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";
import type { DataSourceViewCategoryWithoutApps } from "@app/types/api/public/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { SearchWarningCode } from "@app/types/core/core_api";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/core_api";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { ProjectMetadataType } from "@app/types/project_metadata";
import { isString } from "@app/types/shared/utils/general";
import type { ProjectType, SpaceKind, SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher, KeyedMutator } from "swr";

export function useSpaces({
  workspaceId,
  kinds,
  disabled,
}: {
  workspaceId: string;
  kinds: SpaceKind[] | "all";
  disabled?: boolean;
}) {
  const spacesFetcher: Fetcher<GetSpacesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces`,
    spacesFetcher,
    { disabled }
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const spaces = useMemo(() => {
    return (
      data?.spaces?.filter((s) => kinds === "all" || kinds.includes(s.kind)) ??
      emptyArray<SpaceType | ProjectType>()
    );
    // Serialize the kinds array to a string to avoid unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.spaces, isString(kinds) ? kinds : kinds.toSorted().join(",")]);

  return {
    spaces,
    isSpacesLoading: !error && !data && !disabled,
    isSpacesError: error,
    mutate,
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
      return emptyArray<SpaceType>();
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

// Note that this hook only returns spaces of kind "global", "regular" and "system" (backend enforced).
// The other kinds are left aside as they are not relevant for the admins point of view.
export function useSpacesAsAdmin({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
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

  return {
    spaceInfo: data ? data.space : null,
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

export function useSpacesSearchWithInfiniteScroll({
  disabled = false,
  includeDataSources = false,
  nodeIds,
  owner,
  search,
  spaceIds,
  viewType,
  pageSize = 25,
  allowAdminSearch = false,
  parentId,
}: SpacesSearchParams & { pageSize?: number }): {
  isSearchLoading: boolean;
  isSearchError: boolean;
  isSearchValidating: boolean;
  searchResultNodes: DataSourceContentNode[];
  nextPage: () => Promise<void>;
  hasMore: boolean;
} {
  const body = {
    query: search,
    viewType,
    nodeIds,
    spaceIds,
    includeDataSources,
    limit: pageSize,
    allowAdminSearch,
    parentId,
  };

  // Only perform a query if we have a valid search
  const url =
    (search && search.length >= 1) || nodeIds
      ? `/api/w/${owner.sId}/search`
      : null;

  const { data, error, setSize, size, isValidating, isLoading } =
    useSWRInfiniteWithDefaults(
      (_, previousPageData) => {
        if (!url || disabled) {
          return null;
        }

        const params = new URLSearchParams();

        params.append("limit", pageSize.toString());

        if (previousPageData?.nextPageCursor) {
          params.append("cursor", previousPageData.nextPageCursor);
        }

        return JSON.stringify([url + "?" + params.toString(), body]);
      },
      async (fetchKey: string) => {
        if (!fetchKey) {
          return null;
        }

        const [urlWithParams, bodyWithCursor] = JSON.parse(fetchKey);
        return fetcherWithBody([urlWithParams, bodyWithCursor, "POST"]);
      },
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateFirstPage: false,
      }
    );

  return {
    searchResultNodes: useMemo(
      () => (data ? data.flatMap((d) => (d ? d.nodes : [])) : []),
      [data]
    ),
    isSearchLoading: isLoading,
    isSearchError: error,
    isSearchValidating: isValidating,
    hasMore: data?.[size - 1] ? data[size - 1]?.nextPageCursor !== null : false, // check the last page of the array to see if there is a next page or not
    nextPage: useCallback(async () => {
      await setSize((size) => size + 1);
    }, [setSize]),
  };
}

export function useProjectMetadata({
  workspaceId,
  spaceId,
  disabled = false,
}: {
  workspaceId: string;
  spaceId: string | null;
  disabled?: boolean;
}) {
  const projectMetadataFetcher: Fetcher<GetProjectMetadataResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${spaceId}/project_metadata`,
    projectMetadataFetcher,
    { disabled: disabled || spaceId === null }
  );

  return {
    projectMetadata: data?.projectMetadata ?? null,
    isProjectMetadataLoading: !error && !data && !disabled,
    isProjectMetadataError: error,
    mutateProjectMetadata: mutate,
  };
}

export function useUpdateProjectMetadata({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateProjectMetadata } = useProjectMetadata({
    workspaceId: owner.sId,
    spaceId,
    disabled: true, // Needed just to mutate
  });

  return async (
    updates: PatchProjectMetadataBodyType
  ): Promise<ProjectMetadataType | null> => {
    const url = `/api/w/${owner.sId}/spaces/${spaceId}/project_metadata`;

    const res = await clientFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error updating project metadata",
        description: `Error: ${errorData.message}`,
      });
      return null;
    }

    void mutateProjectMetadata();
    sendNotification({
      type: "success",
      title: "Project metadata updated",
      description: "Project metadata was successfully updated.",
    });

    const response: PatchProjectMetadataResponseBody = await res.json();
    return response.projectMetadata;
  };
}

export function useUserProjectDigests({
  workspaceId,
  spaceId,
  limit = 1,
  disabled = false,
}: {
  workspaceId: string;
  spaceId: string | null;
  limit?: number;
  disabled?: boolean;
}) {
  const digestsFetcher: Fetcher<GetUserProjectDigestsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${spaceId}/user_project_digests?limit=${limit}`,
    digestsFetcher,
    { disabled: disabled || spaceId === null }
  );

  return {
    digests: data?.digests ?? emptyArray(),
    latestDigest: data?.digests?.[0] ?? null,
    isDigestsLoading: !error && !data && !disabled,
    isDigestsError: error,
    mutateDigests: mutate,
  };
}

const DIGEST_GENERATION_STATUS_POLL_INTERVAL_MS = 2_000;

export function useDigestGenerationStatus({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}) {
  const statusFetcher: Fetcher<GetDigestGenerationStatusResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${spaceId}/user_project_digests/generate/status`,
    statusFetcher,
    {
      refreshInterval: (
        data: GetDigestGenerationStatusResponseBody | undefined
      ) =>
        data?.status === "running"
          ? DIGEST_GENERATION_STATUS_POLL_INTERVAL_MS
          : // 0 means disabled
            0,
    }
  );

  return {
    generationStatus: data?.status ?? null,
    isStatusLoading: !error && !data,
    mutateGenerationStatus: mutate,
  };
}

export function useGenerateUserProjectDigest({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doGenerate = async () => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${spaceId}/user_project_digests/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (res.ok) {
      return true;
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error generating project digest",
        description: `Error: ${errorData.message}`,
      });
      return false;
    }
  };

  return doGenerate;
}

export function useLeaveProject({
  owner,
  spaceId,
  spaceName,
  userName,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  spaceName: string;
  userName: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateSpaceInfoRegardlessOfQueryParams } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
    disabled: true,
  });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const doLeave = async (): Promise<boolean> => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${spaceId}/leave`,
      { method: "POST" }
    );

    if (res.ok) {
      void mutateSpaceInfoRegardlessOfQueryParams();
      void mutateSpaceSummary();
      sendNotification({
        type: "success",
        title: `${userName} left project ${spaceName}`,
        description: "You have successfully left the project.",
      });
      return true;
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Could not leave project",
        description: `Error: ${errorData.message}`,
      });
      return false;
    }
  };

  return doLeave;
}

export function useJoinProject({
  owner,
  spaceId,
  spaceName,
  userName,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  spaceName: string;
  userName: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateSpaceInfoRegardlessOfQueryParams } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
    disabled: true,
  });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const doJoin = async (): Promise<boolean> => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${spaceId}/join`,
      { method: "POST" }
    );

    if (res.ok) {
      void mutateSpaceInfoRegardlessOfQueryParams();
      void mutateSpaceSummary();
      sendNotification({
        type: "success",
        title: `${userName} joined project ${spaceName}`,
        description: "You can now participate in conversations.",
      });
      return true;
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Could not join project",
        description: `Error: ${errorData.message}`,
      });
      return false;
    }
  };

  return doJoin;
}
