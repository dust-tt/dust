import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { GetWorkspaceInvitationsResponseBody } from "@app/pages/api/w/[wId]/invitations";
import type { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";
import type { GroupKind, LightWorkspaceType } from "@app/types";
import { isGroupKind } from "@app/types";

type PaginationParams = {
  orderColumn: "createdAt";
  orderDirection: "asc" | "desc";
  limit: number;
  // lastValue is directly set when using the nextPageUrl
};

const appendPaginationParams = (
  params: URLSearchParams,
  pagination?: PaginationParams
) => {
  if (!pagination) {
    return;
  }

  params.set("orderColumn", pagination.orderColumn);
  params.set("orderDirection", pagination.orderDirection);
  params.set("limit", pagination.limit.toString());
};

export function useMembers({
  workspaceId,
  pagination,
  disabled,
}: {
  workspaceId: string;
  pagination?: PaginationParams;
  disabled?: boolean;
}) {
  const defaultUrl = useMemo(() => {
    const params = new URLSearchParams();
    appendPaginationParams(params, pagination);
    return `/api/w/${workspaceId}/members?${params.toString()}`;
  }, [workspaceId, pagination]);

  const [url, setUrl] = useState(defaultUrl);

  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;
  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(url, membersFetcher, {
      disabled,
    });

  return {
    members: data?.members ?? emptyArray(),
    isMembersLoading: !error && !data,
    isMembersError: error,
    hasNextPage: !!data?.nextPageUrl,
    loadNextPage: useCallback(
      () => data?.nextPageUrl && setUrl(data.nextPageUrl),
      [data?.nextPageUrl]
    ),
    mutate,
    mutateRegardlessOfQueryParams,
    total: data ? data.total : 0,
  };
}

function useMembersCount(owner: LightWorkspaceType) {
  const { total } = useMembers({
    workspaceId: owner.sId,
    pagination: { limit: 0, orderColumn: "createdAt", orderDirection: "asc" },
    disabled: owner.role !== "admin",
  });

  return total;
}

function useAdmins(owner: LightWorkspaceType, pagination?: PaginationParams) {
  const params = new URLSearchParams();
  appendPaginationParams(params, pagination);

  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/members?role=admin&${params.toString()}`,
    membersFetcher
  );

  return {
    admins: data?.members ?? emptyArray(),
    isAdminsLoading: !error && !data,
    iAdminsError: error,
    mutateMembers: mutate,
  };
}

export function useWorkspaceInvitations(owner: LightWorkspaceType) {
  const workspaceInvitationsFetcher: Fetcher<GetWorkspaceInvitationsResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/invitations`,
    workspaceInvitationsFetcher
  );

  return {
    invitations: data?.invitations ?? emptyArray(),
    isInvitationsLoading: !error && !data,
    isInvitationsError: error,
    mutateInvitations: mutate,
  };
}

function useMembersByEmails({
  workspaceId,
  emails,
  disabled,
}: {
  workspaceId: string;
  emails: string[];
  disabled?: boolean;
}) {
  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;

  if (emails.length === 0) {
    disabled = true;
  }

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/members/search?searchEmails=${emails.join(",")}`,
      membersFetcher,
      {
        disabled,
      }
    );

  return {
    members: data?.members ?? emptyArray(),
    isMembersLoading: !error && !data && !disabled,
    isMembersError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useSearchMembers({
  workspaceId,
  searchTerm,
  pageIndex,
  pageSize,
  groupKind,
  disabled,
}: {
  workspaceId: string;
  searchTerm: string;
  pageIndex: number;
  pageSize: number;
  groupKind?: Omit<GroupKind, "system">;
  disabled?: boolean;
}) {
  const searchMembersFetcher: Fetcher<SearchMembersResponseBody> = fetcher;
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  useEffect(() => {
    const debouncedSearch = () => {
      setDebouncedSearchTerm(searchTerm);
    };

    debounce(debounceHandle, debouncedSearch, 300);
  }, [searchTerm]);

  const searchParams = new URLSearchParams({
    searchTerm: debouncedSearchTerm,
    orderColumn: "name",
    orderDirection: "asc",
    offset: (pageIndex * pageSize).toString(),
    limit: pageSize.toString(),
  });

  if (groupKind && isGroupKind(groupKind)) {
    searchParams.set("groupKind", groupKind);
  }

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/members/search?${searchParams.toString()}`,
      searchMembersFetcher,
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        disabled,
      }
    );

  return {
    members: data?.members ?? emptyArray(),
    totalMembersCount: data?.total ?? 0,
    isLoading: !error && !data,
    isError: !!error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
