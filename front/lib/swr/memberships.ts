import { useSendNotification } from "@app/hooks/useNotification";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { GetWorkspaceInvitationsResponseBody } from "@app/pages/api/w/[wId]/invitations";
import type { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";
import type {
  GetUserSpendLimitResponseBody,
  PutUserSpendLimitResponseBody,
} from "@app/pages/api/w/[wId]/members/[uId]/spend_limit";
import type { MembersLookupResponseBody } from "@app/pages/api/w/[wId]/members/lookup";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";
import type { GroupKind } from "@app/types/groups";
import { isGroupKind } from "@app/types/groups";
import type { MembershipSeatType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fetcher } from "swr";
import { mutate } from "swr";
import { z } from "zod";

const SpendLimitResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z.number(),
  }),
]);

const PutUserSpendLimitResponseSchema = z.object({
  limit: SpendLimitResponseSchema,
  transitionedTo: z.union([
    z.literal("reached"),
    z.literal("resolved"),
    z.null(),
  ]),
});

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
  const { fetcher } = useFetcher();
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
      // eslint-disable-next-line react-hooks/preserve-manual-memoization
      () => data?.nextPageUrl && setUrl(data.nextPageUrl),
      [data?.nextPageUrl]
    ),
    mutate,
    mutateRegardlessOfQueryParams,
    total: data ? data.total : 0,
  };
}

export function useWorkspaceInvitations(
  owner: LightWorkspaceType,
  { includeExpired = false }: { includeExpired?: boolean } = {}
) {
  const { fetcher } = useFetcher();
  const workspaceInvitationsFetcher: Fetcher<GetWorkspaceInvitationsResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/invitations?includeExpired=${includeExpired}`,
    workspaceInvitationsFetcher
  );

  return {
    invitations: data?.invitations ?? emptyArray(),
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
  groupKind,
  buildersOnly,
  disabled,
}: {
  workspaceId: string;
  searchTerm: string;
  pageIndex: number;
  pageSize: number;
  groupKind?: Exclude<GroupKind, "system">;
  buildersOnly?: boolean;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
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
    offset: (pageIndex * pageSize).toString(),
    limit: pageSize.toString(),
  });

  if (groupKind && isGroupKind(groupKind)) {
    searchParams.set("groupKind", groupKind);
  }

  if (buildersOnly) {
    searchParams.set("buildersOnly", "true");
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
    isLoading: !error && !data && !disabled,
    isError: !!error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useMembersLookup({
  workspaceId,
  memberIds,
  disabled,
}: {
  workspaceId: string;
  memberIds: number[];
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const membersLookupFetcher: Fetcher<MembersLookupResponseBody> = fetcher;

  const query =
    memberIds.length > 0
      ? `/api/w/${workspaceId}/members/lookup?${memberIds
          .map((id) => `ids=${id}`)
          .join("&")}`
      : null;

  const { data, error } = useSWRWithDefaults(query, membersLookupFetcher, {
    disabled,
  });

  return {
    members: data?.users ?? emptyArray(),
    isMembersLookupLoading: !error && !data && !!query && !disabled,
    isMembersLookupError: !!error,
  };
}

export function useMembersUsage({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const defaultUrl = `/api/w/${workspaceId}/credits/members-usage`;
  const [url, setUrl] = useState(defaultUrl);

  const membersUsageFetcher: Fetcher<GetMembersUsageResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(url, membersUsageFetcher, {
    disabled,
  });

  return {
    membersUsage: data?.members ?? emptyArray(),
    isMembersUsageLoading: !error && !data && !disabled,
    isMembersUsageError: !!error,
    totalMembersUsage: data?.total ?? 0,
    hasNextPage: !!data?.nextPageUrl,
    loadNextPage: useCallback(
      () => data?.nextPageUrl && setUrl(data.nextPageUrl),
      [data?.nextPageUrl]
    ),
  };
}

export function useUpdateMemberSeatType({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateSeatType = useCallback(
    async ({
      memberId,
      memberName,
      seatType,
      isCancellingScheduledChange,
    }: {
      memberId: string;
      memberName: string;
      seatType: MembershipSeatType;
      isCancellingScheduledChange: boolean;
    }): Promise<boolean> => {
      const res = await clientFetch(
        `/api/w/${workspaceId}/members/${memberId}/seat-type`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType }),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to update seat",
          description: error?.error?.message ?? "An unexpected error occurred.",
        });
        return false;
      }

      const body = await res.json();
      const isDeferred = !!body?.scheduledSeatChangeAt;
      sendNotification({
        type: "success",
        title: isDeferred ? "Seat change scheduled" : "Seat updated",
        description: isDeferred
          ? `${memberName}'s seat will change to ${seatType} at the next credit refresh.`
          : isCancellingScheduledChange
            ? `${memberName}'s scheduled seat change has been cancelled.`
            : `${memberName}'s seat has been updated to ${seatType}.`,
      });

      await mutate(`/api/w/${workspaceId}/credits/members-usage`);
      return true;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateSeatType };
}

function spendLimitUrl(workspaceId: string, memberId: string): string {
  return `/api/w/${workspaceId}/members/${memberId}/spend_limit`;
}

export function useUserSpendLimit({
  workspaceId,
  memberId,
  disabled,
}: {
  workspaceId: string;
  memberId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const spendLimitFetcher: Fetcher<GetUserSpendLimitResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    spendLimitUrl(workspaceId, memberId),
    spendLimitFetcher,
    { disabled }
  );

  return {
    spendLimit: data,
    isSpendLimitLoading: !error && !data && !disabled,
    isSpendLimitError: !!error,
    mutateSpendLimit: mutate,
  };
}

export function useUpdateUserSpendLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateSpendLimit = useCallback(
    async ({
      memberId,
      memberName,
      limit,
    }: {
      memberId: string;
      memberName: string;
      limit: { kind: "unlimited" } | { kind: "limited"; awuCredits: number };
    }): Promise<PutUserSpendLimitResponseBody | null> => {
      const res = await clientFetch(spendLimitUrl(workspaceId, memberId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limit),
      });

      if (!res.ok) {
        const error = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to update spend limit",
          description: error?.error?.message ?? "An unexpected error occurred.",
        });
        return null;
      }

      const body = PutUserSpendLimitResponseSchema.parse(await res.json());
      let description: string;
      switch (limit.kind) {
        case "unlimited":
          description = `${memberName}'s spend limit has been removed.`;
          break;
        case "limited":
          description = `${memberName}'s spend limit has been set to ${limit.awuCredits.toLocaleString("en-US")} credits.`;
          break;
        default:
          assertNeverAndIgnore(limit);
          description = "";
      }
      sendNotification({
        type: "success",
        title: "Spend limit updated",
        description,
      });

      await mutate(spendLimitUrl(workspaceId, memberId));
      await mutate(`/api/w/${workspaceId}/credits/members-usage`);
      return body;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateSpendLimit };
}
