import type { LightWorkspaceType } from "@dust-tt/types";
import type { PaginationState } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Fetcher } from "swr";

import {
  appendPaginationParams,
  fetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { GetWorkspaceInvitationsResponseBody } from "@app/pages/api/w/[wId]/invitations";
import type { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";

export function useMembers({
  workspaceId,
  pagination,
  disabled,
}: {
  workspaceId: string;
  pagination?: PaginationState;
  disabled?: boolean;
}) {
  const params = new URLSearchParams();
  appendPaginationParams(params, pagination);

  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;
  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(`/api/w/${workspaceId}/members`, membersFetcher, {
      disabled,
    });

  return {
    members: useMemo(() => (data ? data.members : []), [data]),
    isMembersLoading: !error && !data,
    isMembersError: error,
    mutate,
    mutateRegardlessOfQueryParams,
    total: data ? data.total : 0,
  };
}

export function useAdmins(owner: LightWorkspaceType) {
  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/members?role=admin`,
    membersFetcher
  );

  return {
    admins: useMemo(() => (data ? data.members : []), [data]),
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
    invitations: useMemo(() => (data ? data.invitations : []), [data]),
    isInvitationsLoading: !error && !data,
    isInvitationsError: error,
    mutateInvitations: mutate,
  };
}

export function useSearchMembers({
  workspaceId,
  searchTerm,
  pageIndex,
  pageSize,
  disabled,
}: {
  workspaceId: string;
  searchTerm: string;
  pageIndex: number;
  pageSize: number;
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
    orderBy: "name",
    lastValue: (pageIndex * pageSize).toString(),
  });

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
    members: useMemo(() => (data ? data.members : []), [data]),
    totalMembersCount: data?.total ?? 0,
    isLoading: !error && !data,
    isError: !!error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
