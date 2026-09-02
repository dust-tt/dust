import { useSendNotification } from "@app/hooks/useNotification";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import type { GetMembersResponseBody } from "@app/lib/api/workspace";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { GetWorkspaceInvitationsResponseBody } from "@app/types/api/invitation";
import type {
  GetFreeSeatCountsResponseBody,
  MembersLookupResponseBody,
} from "@app/types/api/members";
import type {
  GetUserSpendLimitResponseBody,
  PutUserSpendLimitResponseBody,
} from "@app/types/api/users/spend_limit";
import { SUPPORTED_CURRENCIES } from "@app/types/currency";
import type { GroupKind } from "@app/types/groups";
import { isGroupKind } from "@app/types/groups";
import type { MembershipSeatType, PaidSeatType } from "@app/types/memberships";
import { MEMBERSHIP_SEAT_TYPES, PAID_SEAT_TYPES } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  ActiveRoleType,
  LightUserTypeWithWorkspace,
  LightWorkspaceType,
} from "@app/types/user";
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

export function useSearchMembers<
  T extends LightUserTypeWithWorkspace = LightUserTypeWithWorkspace,
>({
  workspaceId,
  searchTerm,
  pageIndex,
  pageSize,
  groupKind,
  role,
  disabled,
}: {
  workspaceId: string;
  searchTerm: string;
  pageIndex: number;
  pageSize: number;
  groupKind?: Exclude<GroupKind, "system">;
  role?: ActiveRoleType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const searchMembersFetcher: Fetcher<{
    members: T[];
    total: number;
  }> = fetcher;
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

  if (role) {
    searchParams.set("role", role);
  }

  const { data, error, isValidating, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/members/search?${searchParams.toString()}`,
      searchMembersFetcher,
      {
        keepPreviousData: true,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        disabled,
      }
    );

  return {
    members: data?.members ?? emptyArray(),
    totalMembersCount: data?.total ?? 0,
    isLoading: !error && !data && !disabled,
    isMembersValidating: isValidating,
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

function membersUsageUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/credits/members-usage`;
}

function bulkSpendLimitUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/members/bulk-spend-limit`;
}

function bulkSeatTypeUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/members/bulk-seat-type`;
}

// Cross-page member selection descriptor shared by the bulk member endpoints
// (spend limit and seat type).
export type BulkMemberSelectionBody =
  | { mode: "ids"; userIds: string[] }
  | {
      mode: "all";
      filter: { seatType?: string; groupId?: string; search?: string };
      excludeUserIds: string[];
    };

const BulkSetUserSpendLimitResponseSchema = z.object({
  workflowId: z.string(),
  memberCount: z.number().int(),
});

export function useBulkSetUserSpendLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doBulkSetSpendLimit = useCallback(
    async ({
      selection,
      limit,
    }: {
      selection: BulkMemberSelectionBody;
      limit: { kind: "unlimited" } | { kind: "limited"; awuCredits: number };
    }): Promise<{ workflowId: string; memberCount: number } | null> => {
      const res = await clientFetch(bulkSpendLimitUrl(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, limit }),
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

      const body = BulkSetUserSpendLimitResponseSchema.parse(await res.json());
      sendNotification({
        type: "success",
        title: "Spend limit updated",
        description:
          limit.kind === "limited"
            ? `Applied a ${limit.awuCredits.toLocaleString("en-US")} credit limit to ${body.memberCount.toLocaleString("en-US")} members.`
            : `Removed the spend limit for ${body.memberCount.toLocaleString("en-US")} members.`,
      });

      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification]
  );

  return { doBulkSetSpendLimit };
}

const BulkSeatChangeMoveSchema = z.object({
  fromSeatType: z.enum(MEMBERSHIP_SEAT_TYPES),
  fromSeatName: z.string().nullable(),
  kind: z.enum(["unchanged", "immediate", "deferred"]),
  count: z.number().int(),
});

const BulkSeatChangeSeatTotalSchema = z.object({
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES),
  seatName: z.string(),
  committedSeats: z.number().int(),
  assignedBefore: z.number().int(),
  assignedAfter: z.number().int(),
});

const BulkSeatChangePreviewResponseSchema = z.object({
  preview: z.object({
    memberCount: z.number().int(),
    targetSeatType: z.enum(PAID_SEAT_TYPES),
    targetSeatName: z.string(),
    currency: z.enum(SUPPORTED_CURRENCIES),
    moves: z.array(BulkSeatChangeMoveSchema),
    immediateDeltaMonthlyCents: z.number(),
    deferredDeltaMonthlyCents: z.number(),
    // Optional: tolerate an older server that doesn't send the fields yet.
    nextBillingPeriodAt: z.string().nullable().optional(),
    seatTotals: z.array(BulkSeatChangeSeatTotalSchema).optional(),
  }),
});

export type BulkSeatChangePreviewBody = z.infer<
  typeof BulkSeatChangePreviewResponseSchema
>["preview"];

export function useBulkSeatChangePreview({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doFetchSeatChangePreview = useCallback(
    async ({
      selection,
      seatType,
    }: {
      selection: BulkMemberSelectionBody;
      seatType: PaidSeatType;
    }): Promise<BulkSeatChangePreviewBody | null> => {
      const res = await clientFetch(`${bulkSeatTypeUrl(workspaceId)}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, seatType }),
      });

      if (!res.ok) {
        const error = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to prepare seat change",
          description: error?.error?.message ?? "An unexpected error occurred.",
        });
        return null;
      }

      return BulkSeatChangePreviewResponseSchema.parse(await res.json())
        .preview;
    },
    [workspaceId, sendNotification]
  );

  return { doFetchSeatChangePreview };
}

const BulkChangeSeatTypeResponseSchema = z.object({
  workflowId: z.string(),
  memberCount: z.number().int(),
});

export function useBulkChangeSeatType({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doBulkChangeSeatType = useCallback(
    async ({
      selection,
      seatType,
      seatName,
      hasDeferredChanges,
    }: {
      selection: BulkMemberSelectionBody;
      seatType: PaidSeatType;
      seatName: string;
      // Whether some selected members are being downgraded — their change
      // applies at the next credit refresh, so the notification says so.
      hasDeferredChanges: boolean;
    }): Promise<{ workflowId: string; memberCount: number } | null> => {
      const res = await clientFetch(bulkSeatTypeUrl(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, seatType }),
      });

      if (!res.ok) {
        const error = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to update seats",
          description: error?.error?.message ?? "An unexpected error occurred.",
        });
        return null;
      }

      const body = BulkChangeSeatTypeResponseSchema.parse(await res.json());
      sendNotification({
        type: "success",
        title: "Seats updated",
        description: hasDeferredChanges
          ? `Changed ${body.memberCount.toLocaleString("en-US")} members to ${seatName}. Downgrades take effect at the next credit refresh.`
          : `Changed ${body.memberCount.toLocaleString("en-US")} members to ${seatName}.`,
      });

      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification]
  );

  return { doBulkChangeSeatType };
}

export async function invalidateMembersUsage(
  workspaceId: string
): Promise<void> {
  await mutate(
    (key) =>
      typeof key === "string" && key.startsWith(membersUsageUrl(workspaceId))
  );
}

export function useMembersUsage({
  workspaceId,
  searchTerm = "",
  pageIndex,
  pageSize,
  orderColumn,
  orderDirection,
  seatType,
  groupId,
  disabled,
}: {
  workspaceId: string;
  searchTerm?: string;
  pageIndex: number;
  pageSize: number;
  orderColumn?:
    | "name"
    | "email"
    | "consumedAwuCredits"
    | "consumedFromPoolAwuCredits";
  orderDirection?: "asc" | "desc";
  seatType?: MembershipSeatType | "none";
  groupId?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const membersUsageFetcher: Fetcher<GetMembersUsageResponseBody> = fetcher;
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const searchParams = new URLSearchParams({
    offset: (pageIndex * pageSize).toString(),
    limit: pageSize.toString(),
  });
  if (debouncedSearchTerm.trim().length > 0) {
    searchParams.set("search", debouncedSearchTerm.trim());
  }
  if (orderColumn) {
    searchParams.set("orderColumn", orderColumn);
  }
  if (orderDirection) {
    searchParams.set("orderDirection", orderDirection);
  }
  if (seatType) {
    searchParams.set("seatType", seatType);
  }
  if (groupId) {
    searchParams.set("groupId", groupId);
  }

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `${membersUsageUrl(workspaceId)}?${searchParams.toString()}`,
    membersUsageFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
      disabled,
    }
  );

  return {
    membersUsage: data?.members ?? emptyArray(),
    creditsResetAt: data?.creditsResetAt ?? null,
    isMembersUsageLoading: !error && !data && !disabled,
    isMembersUsageRefreshing: isLoading && !!data && !disabled,
    isMembersUsageError: !!error,
    totalMembersUsage: data?.total ?? 0,
    mutateMembersUsage: mutate,
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
      hasSeatPool,
    }: {
      memberId: string;
      memberName: string;
      seatType: MembershipSeatType;
      isCancellingScheduledChange: boolean;
      hasSeatPool: boolean;
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
      const notification = getSeatUpdateNotification({
        seatType,
        isDeferred,
        isCancellingScheduledChange,
        hasSeatPool,
        memberName,
      });
      sendNotification({ type: "success", ...notification });

      await invalidateMembersUsage(workspaceId);
      return true;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateSeatType };
}

function getSeatUpdateNotification({
  seatType,
  isDeferred,
  isCancellingScheduledChange,
  hasSeatPool,
  memberName,
}: {
  seatType: MembershipSeatType;
  isDeferred: boolean;
  isCancellingScheduledChange: boolean;
  hasSeatPool: boolean;
  memberName: string;
}): { title: string; description: string } {
  if (seatType === "none") {
    return {
      title: isDeferred ? "Seat removal scheduled" : "Seat removed",
      description: isDeferred
        ? `${memberName}'s seat will be removed at the next billing period. They keep full access until then.`
        : `${memberName}'s seat has been removed.`,
    };
  }
  return {
    title: isDeferred ? "Seat change scheduled" : "Seat updated",
    description: isDeferred
      ? `${memberName}'s seat will change to ${seatType} at the next credit refresh.`
      : isCancellingScheduledChange
        ? `${memberName}'s scheduled seat change has been cancelled.`
        : hasSeatPool
          ? `${memberName}'s seat has been updated to ${seatType}. The seat pool will be provisioned shortly.`
          : `${memberName}'s seat has been updated to ${seatType}.`,
  };
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
      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateSpendLimit };
}

export function useFreeSeatCounts({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const freeSeatCountsFetcher: Fetcher<GetFreeSeatCountsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/members/free-seats`,
    freeSeatCountsFetcher,
    { disabled }
  );

  return {
    freeSeatCounts: data?.freeSeatCounts,
    isFreeSeatCountsLoading: !error && !data && !disabled,
    isFreeSeatCountsError: !!error,
  };
}
