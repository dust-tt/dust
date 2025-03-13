import { useSendNotification } from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewCategory,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  SearchWarningCode,
  SpaceType,
} from "@dust-tt/types";
import { MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher, KeyedMutator } from "swr";

import type { CursorPaginationParams } from "@app/lib/api/pagination";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { getSpaceName } from "@app/lib/spaces";
import {
  fetcher,
  fetcherWithBody,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  DataSourceContentNode,
  PostWorkspaceSearchResponseBody,
} from "@app/pages/api/w/[wId]/search";
import type {
  GetSpacesResponseBody,
  PostSpacesResponseBody,
} from "@app/pages/api/w/[wId]/spaces";
import type {
  GetSpaceResponseBody,
  PatchSpaceResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { GetSpaceDataSourceViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views";
import type { GetDataSourceViewResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]";
import type { PostSpaceDataSourceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import type {
  PostSpaceSearchRequestBody,
  PostSpaceSearchResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/search";

export function useSpaces({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const spacesFetcher: Fetcher<GetSpacesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces`,
    spacesFetcher,
    { disabled }
  );

  return {
    spaces: useMemo(() => (data ? data.spaces : []), [data]),
    isSpacesLoading: !error && !data && !disabled,
    isSpacesError: error,
    mutate,
  };
}

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
    spaces: useMemo(() => (data ? data.spaces : []), [data]),
    isSpacesLoading: !error && !data && !disabled,
    isSpacesError: error,
    mutate,
  };
}

export function useSpaceInfo({
  workspaceId,
  spaceId,
  disabled,
}: {
  workspaceId: string;
  spaceId: string | null;
  disabled?: boolean;
}) {
  const spacesCategoriesFetcher: Fetcher<GetSpaceResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${spaceId}`,
    spacesCategoriesFetcher,
    {
      disabled: disabled || spaceId === null,
    }
  );

  return {
    spaceInfo: data ? data.space : null,
    mutateSpaceInfo: mutate,
    isSpaceInfoLoading: !error && !data && !disabled,
    isSpaceInfoError: error,
  };
}

export function useSpaceDataSourceView({
  owner,
  spaceId,
  dataSourceViewId,
  disabled,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  dataSourceViewId?: string;
  disabled?: boolean;
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
  category?: Exclude<DataSourceViewCategory, "apps">;
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

  const spaceDataSourceViews = useMemo(() => {
    return (data?.dataSourceViews ??
      []) as GetSpaceDataSourceViewsResponseBody<false>["dataSourceViews"];
  }, [data]);

  return {
    spaceDataSourceViews,
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
  category: Exclude<DataSourceViewCategory, "apps">;
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

  const spaceDataSourceViews = useMemo(() => {
    return (data?.dataSourceViews ??
      []) as GetSpaceDataSourceViewsResponseBody<true>["dataSourceViews"];
  }, [data]);

  return {
    spaceDataSourceViews,
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

    const res = await fetch(
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
    const res = await fetch(
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
  category: Exclude<DataSourceViewCategory, "apps">;
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
    const res = await fetch(
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

type DoCreateOrUpdateAllowedParams =
  | { name: string | null; memberIds: null; isRestricted: false }
  | { name: string | null; memberIds: string[]; isRestricted: true };

export function useCreateSpace({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutate: mutateSpaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate.
  });
  const { mutate: mutateSpacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate.
  });

  const doCreate = async ({
    name,
    memberIds,
    isRestricted,
  }: DoCreateOrUpdateAllowedParams) => {
    if (!name) {
      return null;
    }

    if (isRestricted && (!memberIds || memberIds?.length < 1)) {
      return null;
    }

    const url = `/api/w/${owner.sId}/spaces`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        memberIds,
        isRestricted,
      }),
    });

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
        title: "Successfully created space",
        description: "Space was successfully created.",
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
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateSpacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doUpdate = async (
    space: SpaceType,
    params: DoCreateOrUpdateAllowedParams
  ) => {
    const { name: newName, memberIds, isRestricted } = params;

    const updatePromises: Promise<Response>[] = [];

    // Prepare space update request.
    if (newName) {
      const spaceUrl = `/api/w/${owner.sId}/spaces/${space.sId}`;
      updatePromises.push(
        fetch(spaceUrl, {
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

    // Prepare space members update request if provided.
    const spaceMembersUrl = `/api/w/${owner.sId}/spaces/${space.sId}/members`;
    updatePromises.push(
      fetch(spaceMembersUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberIds,
          isRestricted,
        }),
      })
    );

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
      title: "Successfully updated space",
      description: "Space was successfully updated.",
    });

    const spaceResponse: PatchSpaceResponseBody = await results[0].json();
    return spaceResponse.space;
  };
  return doUpdate;
}

export function useDeleteSpace({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutate: mutateSpaces } = useSpaces({
    workspaceId: owner.sId,
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
    const url = `/api/w/${owner.sId}/spaces/${space.sId}`;
    const res = await fetch(url, {
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

export function useSpaceSearch({
  dataSourceViews,
  disabled = false,
  includeDataSources = false,
  owner,
  search,
  space,
  viewType,
  pagination,
}: {
  dataSourceViews: DataSourceViewType[];
  disabled?: boolean;
  includeDataSources: boolean;
  owner: LightWorkspaceType;
  search: string;
  space: SpaceType;
  viewType: ContentNodesViewType;
  warningCode?: SearchWarningCode;
  pagination?: CursorPaginationParams;
}): {
  isSearchLoading: boolean;
  isSearchError: boolean;
  isSearchValidating: boolean;
  mutate: KeyedMutator<PostSpaceSearchResponseBody>;
  searchResultNodes: DataSourceViewContentNode[];
  total: number;
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
} {
  const params = new URLSearchParams();
  if (pagination?.cursor) {
    params.append("cursor", pagination.cursor);
  }
  if (pagination?.limit) {
    params.append("limit", pagination.limit.toString());
  }

  const body: PostSpaceSearchRequestBody = {
    dataSourceViewIds: dataSourceViews.map((dsv) => dsv.sId),
    includeDataSources,
    limit: pagination?.limit ?? DEFAULT_SEARCH_LIMIT,
    query: search,
    viewType,
  };

  // Only perform a query if we have a valid search.
  const url =
    search.length >= MIN_SEARCH_QUERY_SIZE
      ? `/api/w/${owner.sId}/spaces/${space.sId}/search?${params}`
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
    searchResultNodes: useMemo(() => data?.nodes ?? [], [data]),
    total: data?.total ?? 0,
    isSearchLoading: isLoading,
    isSearchError: error,
    mutate,
    isSearchValidating: isValidating,
    warningCode: data?.warningCode,
    nextPageCursor: data?.nextPageCursor || null,
  };
}

type BaseSearchParams = {
  disabled?: boolean;
  includeDataSources: boolean;
  owner: LightWorkspaceType;
  spaceIds?: string[];
  viewType: ContentNodesViewType;
  pagination?: CursorPaginationParams;
};

// Text search variant
type TextSearchParams = BaseSearchParams & {
  search: string;
  nodeIds?: undefined;
};

// Node ID search variant
type NodeIdSearchParams = BaseSearchParams & {
  search?: undefined;
  nodeIds: string[];
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
}: SpacesSearchParams): {
  isSearchLoading: boolean;
  isSearchError: boolean;
  isSearchValidating: boolean;
  mutate: KeyedMutator<PostWorkspaceSearchResponseBody>;
  searchResultNodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
} {
  const params = new URLSearchParams();
  if (pagination?.cursor) {
    params.append("cursor", pagination.cursor);
  }
  if (pagination?.limit) {
    params.append("limit", pagination.limit.toString());
  }

  const body = {
    query: search,
    viewType,
    nodeIds,
    spaceIds,
    includeDataSources,
    limit: pagination?.limit ?? DEFAULT_SEARCH_LIMIT,
  };

  // Only perform a query if we have a valid search
  const url =
    (search && search.length >= MIN_SEARCH_QUERY_SIZE) || nodeIds
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
    searchResultNodes: useMemo(() => data?.nodes ?? [], [data]),
    isSearchLoading: isLoading,
    isSearchError: error,
    mutate,
    isSearchValidating: isValidating,
    warningCode: data?.warningCode,
    nextPageCursor: data?.nextPageCursor || null,
  };
}
