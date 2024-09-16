import type { LightWorkspaceType } from "@dust-tt/types";
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
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/members`,
    membersFetcher,
    { disabled }
  );

  return {
    members: useMemo(() => (data ? data.members : []), [data]),
    isMembersLoading: !error && !data,
    isMembersError: error,
    mutateMembers: mutate,
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
