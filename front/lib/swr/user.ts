import { useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { GetUserResponseBody } from "@app/pages/api/user";
import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";

export function useUser() {
  const userFetcher: Fetcher<GetUserResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults("/api/user", userFetcher);

  return {
    user: data ? data.user : null,
    isUserLoading: !error && !data,
    isUserError: error,
  };
}

export function useUserMetadata(key: string) {
  const userMetadataFetcher: Fetcher<GetUserMetadataResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/user/metadata/${encodeURIComponent(key)}`,
    userMetadataFetcher
  );

  return {
    metadata: data ? data.metadata : null,
    isMetadataLoading: !error && !data,
    isMetadataError: error,
    mutateMetadata: mutate,
  };
}

export function useSearchMembers(
  workspaceId: string,
  searchTerm: string,
  pageIndex: number,
  pageSize: number
) {
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

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/members/search?${searchParams.toString()}`,
    searchMembersFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    members: data?.members ?? [],
    membersCount: data?.total ?? 0,
    isLoading: !error && !data,
    isError: !!error,
    mutateMembers: mutate,
  };
}
