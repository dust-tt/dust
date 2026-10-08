import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import type { GetMembersResponseBody } from "@app/lib/api/workspace";
import { clientFetch } from "@app/lib/egress/client";
import { formatNumber } from "@app/lib/i18n/format";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { GetWorkspaceInvitationsResponseBody } from "@app/types/api/invitation";
import type {
  GetFreeSeatCountsResponseBody,
  MembersLookupResponseBody,
} from "@app/types/api/members";
import type {
  PutUserSpendLimitResponseBody,
  UserSpendLimit,
} from "@app/types/api/users/spend_limit";
import { SUPPORTED_CURRENCIES } from "@app/types/currency";
import type { UserVisibleGroupKind } from "@app/types/groups";
import type { MembershipSeatType, PaidSeatType } from "@app/types/memberships";
import { MEMBERSHIP_SEAT_TYPES, PAID_SEAT_TYPES } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  ActiveRoleType,
  LightUserTypeWithWorkspace,
  LightWorkspaceType,
} from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
  managedOnly,
  role,
  disabled,
  keepPreviousData = true,
  debounceMs = 300,
}: {
  workspaceId: string;
  searchTerm: string;
  pageIndex: number;
  pageSize: number;
  groupKind?: UserVisibleGroupKind;
  managedOnly?: boolean;
  role?: ActiveRoleType;
  disabled?: boolean;
  /** When false, clear results while the next query loads (e.g. command palette). */
  keepPreviousData?: boolean;
  /** Set to 0 when the caller already debounces the search term. */
  debounceMs?: number;
}) {
  const { fetcher } = useFetcher();
  const searchMembersFetcher: Fetcher<{
    members: T[];
    total: number;
  }> = fetcher;
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedSearchTerm(searchTerm);
      return;
    }

    const debouncedSearch = () => {
      setDebouncedSearchTerm(searchTerm);
    };

    debounce(debounceHandle, debouncedSearch, debounceMs);
  }, [searchTerm, debounceMs]);

  const searchParams = new URLSearchParams({
    searchTerm: debouncedSearchTerm,
    offset: (pageIndex * pageSize).toString(),
    limit: pageSize.toString(),
  });

  if (managedOnly) {
    searchParams.set("managedOnly", "true");
  }

  if (groupKind) {
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
        keepPreviousData,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        disabled,
      }
    );

  return {
    members: data?.members ?? emptyArray(),
    searchQuery: debouncedSearchTerm,
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doBulkSetSpendLimit = useCallback(
    async ({
      selection,
      limit,
    }: {
      selection: BulkMemberSelectionBody;
      limit: UserSpendLimit;
    }): Promise<{ workflowId: string; memberCount: number } | null> => {
      const res = await clientFetch(bulkSpendLimitUrl(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, limit }),
      });

      if (!res.ok) {
        const error = await res.json();
        sendApiErrorNotification({
          title: t`Failed to update spend limit`,
          error,
        });
        return null;
      }

      const body = BulkSetUserSpendLimitResponseSchema.parse(await res.json());
      const { memberCount } = body;
      const formattedMemberCount = formatNumber(memberCount);
      let description: string;
      switch (limit.kind) {
        case "limited": {
          const awuCredits = formatNumber(limit.awuCredits);
          description = t`${plural(memberCount, {
            one: `Applied a ${awuCredits} credit limit to ${formattedMemberCount} member.`,
            other: `Applied a ${awuCredits} credit limit to ${formattedMemberCount} members.`,
          })}`;
          break;
        }
        case "unlimited":
          description = t`${plural(memberCount, {
            one: `Removed the personal limit for ${formattedMemberCount} member.`,
            other: `Removed the personal limit for ${formattedMemberCount} members.`,
          })}`;
          break;
        default:
          assertNeverAndIgnore(limit);
          description = "";
      }
      sendNotification({
        type: "success",
        title: t`Spend limit updated`,
        description,
      });

      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
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

export const BulkSeatChangePreviewResponseSchema = z.object({
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
    blockedByCapCount: z.number().int().optional(),
    targetMaxSeats: z.number().int().nullable().optional(),
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

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
        sendApiErrorNotification({
          title: t`Failed to prepare seat change`,
          error,
        });
        return null;
      }

      return BulkSeatChangePreviewResponseSchema.parse(await res.json())
        .preview;
    },
    [workspaceId, sendApiErrorNotification, t]
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doBulkChangeSeatType = useCallback(
    async ({
      selection,
      seatType,
      hasDeferredChanges,
    }: {
      selection: BulkMemberSelectionBody;
      seatType: PaidSeatType;
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
        sendApiErrorNotification({
          title: t`Failed to update seats`,
          error,
        });
        return null;
      }

      const body = BulkChangeSeatTypeResponseSchema.parse(await res.json());
      const { memberCount } = body;
      const formattedMemberCount = formatNumber(memberCount);
      const seatName = seatTypeDisplayName(seatType, t);
      sendNotification({
        type: "success",
        title: t`Seats updated`,
        description: hasDeferredChanges
          ? t`${plural(memberCount, {
              one: `Changed ${formattedMemberCount} member to ${seatName}. Downgrades take effect at the next credit refresh.`,
              other: `Changed ${formattedMemberCount} members to ${seatName}. Downgrades take effect at the next credit refresh.`,
            })}`
          : t`${plural(memberCount, {
              one: `Changed ${formattedMemberCount} member to ${seatName}.`,
              other: `Changed ${formattedMemberCount} members to ${seatName}.`,
            })}`,
      });

      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
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
    | "consumedFromPoolAwuCredits"
    | "seatUsage";
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        sendApiErrorNotification({
          title: t`Failed to update seat`,
          error,
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
        seatName: seatTypeDisplayName(seatType, t),
      });
      sendNotification({
        type: "success",
        title: t(notification.title),
        description: t(notification.description),
      });

      await invalidateMembersUsage(workspaceId);
      return true;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
  );

  return { doUpdateSeatType };
}

function getSeatUpdateNotification({
  seatType,
  isDeferred,
  isCancellingScheduledChange,
  hasSeatPool,
  memberName,
  seatName,
}: {
  seatType: MembershipSeatType;
  isDeferred: boolean;
  isCancellingScheduledChange: boolean;
  hasSeatPool: boolean;
  memberName: string;
  seatName: string;
}): { title: MessageDescriptor; description: MessageDescriptor } {
  if (seatType === "none") {
    return {
      title: isDeferred ? msg`Seat removal scheduled` : msg`Seat removed`,
      description: isDeferred
        ? msg`${memberName}'s seat will be removed at the next billing period. They keep full access until then.`
        : msg`${memberName}'s seat has been removed.`,
    };
  }
  return {
    title: isDeferred ? msg`Seat change scheduled` : msg`Seat updated`,
    description: isDeferred
      ? msg`${memberName}'s seat will change to ${seatName} at the next credit refresh.`
      : isCancellingScheduledChange
        ? msg`${memberName}'s scheduled seat change has been cancelled.`
        : hasSeatPool
          ? msg`${memberName}'s seat has been updated to ${seatName}. The seat pool will be provisioned shortly.`
          : msg`${memberName}'s seat has been updated to ${seatName}.`,
  };
}

function spendLimitUrl(workspaceId: string, memberId: string): string {
  return `/api/w/${workspaceId}/members/${memberId}/spend_limit`;
}

export function useUpdateUserSpendLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doUpdateSpendLimit = useCallback(
    async ({
      memberId,
      memberName,
      limit,
      resetAtNextBillingCycle,
    }: {
      memberId: string;
      memberName: string;
      limit: { kind: "unlimited" } | { kind: "limited"; awuCredits: number };
      resetAtNextBillingCycle?: boolean;
    }): Promise<PutUserSpendLimitResponseBody | null> => {
      const res = await clientFetch(spendLimitUrl(workspaceId, memberId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          limit.kind === "limited"
            ? {
                ...limit,
                ...(resetAtNextBillingCycle
                  ? { resetAtNextBillingCycle: true }
                  : {}),
              }
            : limit
        ),
      });

      if (!res.ok) {
        const error = await res.json();
        sendApiErrorNotification({
          title: t`Failed to update spend limit`,
          error,
        });
        return null;
      }

      const body = PutUserSpendLimitResponseSchema.parse(await res.json());
      let description: string;
      switch (limit.kind) {
        case "unlimited":
          description = t`${memberName}'s spend limit has been removed.`;
          break;
        case "limited": {
          const awuCredits = formatNumber(limit.awuCredits);
          description = resetAtNextBillingCycle
            ? t`${memberName}'s spend limit has been set to ${awuCredits} credits until the next billing cycle.`
            : t`${memberName}'s spend limit has been set to ${awuCredits} credits.`;
          break;
        }
        default:
          assertNeverAndIgnore(limit);
          description = "";
      }
      sendNotification({
        type: "success",
        title: t`Spend limit updated`,
        description,
      });

      await mutate(spendLimitUrl(workspaceId, memberId));
      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
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
