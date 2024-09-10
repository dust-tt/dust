import type {
  LightUserType,
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";
import type { PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import {
  appendPaginationParams,
  fetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetWorkspaceInvitationsResponseBody } from "@app/pages/api/w/[wId]/invitations";
import type { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";

export function useMembers<T extends boolean = false>({
  owner,
  pagination,
  returnLight,
}: {
  owner: LightWorkspaceType;
  pagination?: PaginationState;
  returnLight?: boolean;
}) {
  const params = new URLSearchParams();
  appendPaginationParams(params, pagination);

  const url = returnLight
    ? `/api/w/${owner.sId}/members?light=true`
    : `/api/w/${owner.sId}/members`;

  const membersFetcher: Fetcher<GetMembersResponseBody<T>> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(url, membersFetcher);

  return {
    members: useMemo(
      () =>
        (data ? data.members : []) as T extends true
          ? LightUserType[]
          : UserTypeWithWorkspaces[],
      [data]
    ),
    isMembersLoading: !error && !data,
    isMembersError: error,
    mutateMembers: mutate,
    total: data ? data.total : 0,
  };
}

export function useAdmins(owner: LightWorkspaceType) {
  const membersFetcher: Fetcher<GetMembersResponseBody<true>> = fetcher;
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
