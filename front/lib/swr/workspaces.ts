import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWorkspaceResponseBody } from "@app/pages/api/w/[wId]";
import type { GetWorkspaceFeatureFlagsResponseType } from "@app/pages/api/w/[wId]/feature-flags";
import type { GetSeatAvailabilityResponseBody } from "@app/pages/api/w/[wId]/seats/availability";
import type { GetWorkspaceSeatsCountResponseBody } from "@app/pages/api/w/[wId]/seats/count";
import type { GetSubscriptionsResponseBody } from "@app/pages/api/w/[wId]/subscriptions";
import type { GetSubscriptionPricingResponseBody } from "@app/pages/api/w/[wId]/subscriptions/pricing";
import type { GetSubscriptionTrialInfoResponseBody } from "@app/pages/api/w/[wId]/subscriptions/trial-info";
import type { GetWorkspaceVerifiedDomainsResponseBody } from "@app/pages/api/w/[wId]/verified-domains";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";
import type { LightWorkspaceType, WhitelistableFeature } from "@app/types";

export function useWorkspace({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const workspaceFetcher: Fetcher<GetWorkspaceResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    `/api/w/${owner.sId}`,
    workspaceFetcher,
    { disabled }
  );

  return {
    workspace: data?.workspace,
    isWorkspaceLoading: !error && !data && !disabled,
    isWorkspaceValidating: isValidating,
    isWorkspaceError: error,
    mutateWorkspace: mutate,
  };
}

export function useWorkspaceSubscriptions({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const workspaceSubscrptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/subscriptions`,
    workspaceSubscrptionsFetcher
  );

  return {
    subscriptions: data?.subscriptions ?? emptyArray(),
    isSubscriptionsLoading: !error && !data,
    isSubscriptionsError: error,
  };
}

export function useWorkspaceAnalytics({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const analyticsFetcher: Fetcher<GetWorkspaceAnalyticsResponse> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/workspace-analytics`,
    analyticsFetcher,
    {
      disabled,
    }
  );

  return {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    analytics: data ? data : null,
    isMemberCountLoading: !error && !data,
    isMemberCountError: error,
  };
}

export function useWorkspaceActiveSubscription({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType | undefined;
  disabled?: boolean;
}) {
  const workspaceSubscriptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    owner ? `/api/w/${owner.sId}/subscriptions` : null,
    workspaceSubscriptionsFetcher,
    {
      disabled,
    }
  );

  const activeSubscription = useMemo(() => {
    if (!data) {
      return null;
    }
    const activeSubscriptions = data.subscriptions.filter(
      (sub) => sub.status === "active"
    );
    return activeSubscriptions.length ? activeSubscriptions[0] : null;
  }, [data]);

  return {
    activeSubscription,
    isActiveSubscriptionLoading: !error && !data,
    isActiveSubscriptionError: error,
  };
}

export function useFeatureFlags({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const featureFlagsFetcher: Fetcher<GetWorkspaceFeatureFlagsResponseType> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/feature-flags`,
    featureFlagsFetcher,
    {
      disabled,
      focusThrottleInterval: 30 * 60 * 1000, // 30 minutes
    }
  );

  const hasFeature = useCallback(
    (flag: WhitelistableFeature | null | undefined) => {
      if (!flag) {
        return true;
      }
      return !!data?.feature_flags.includes(flag);
    },
    [data]
  );

  return {
    featureFlags: data?.feature_flags ?? emptyArray(),
    isFeatureFlagsLoading: !error && !data,
    isFeatureFlagsError: error,
    hasFeature,
  };
}

export function useWorkspaceProgrammaticCost({
  workspaceId,
  groupBy,
  selectedPeriod,
  billingCycleStartDay,
  filter,
  disabled,
}: {
  workspaceId: string;
  groupBy?: GroupByType;
  selectedPeriod?: string;
  billingCycleStartDay: number;
  filter?: Partial<Record<GroupByType, string[]>>;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceProgrammaticCostResponse> = fetcher;

  const queryParams = new URLSearchParams();
  queryParams.set("billingCycleStartDay", billingCycleStartDay.toString());
  if (selectedPeriod) {
    queryParams.set("selectedPeriod", selectedPeriod);
  }
  if (groupBy) {
    queryParams.set("groupBy", groupBy);
  }
  if (filter && Object.keys(filter).length > 0) {
    queryParams.set("filter", JSON.stringify(filter));
  }
  const queryString = queryParams.toString();
  const key = `/api/w/${workspaceId}/analytics/programmatic-cost?${queryString}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    programmaticCostData: data,
    isProgrammaticCostLoading: !error && !data && !disabled,
    isProgrammaticCostError: error,
    isProgrammaticCostValidating: isValidating,
  };
}

export function useWorkspaceSeatAvailability({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const seatAvailabilityFetcher: Fetcher<GetSeatAvailabilityResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/seats/availability`,
    seatAvailabilityFetcher,
    { disabled }
  );

  return {
    hasAvailableSeats: data?.hasAvailableSeats ?? false,
    isSeatAvailabilityLoading: !error && !data && !disabled,
    isSeatAvailabilityError: error,
    mutateSeatAvailability: mutate,
  };
}

export function usePerSeatPricing({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const pricingFetcher: Fetcher<GetSubscriptionPricingResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/pricing`,
    pricingFetcher,
    { disabled }
  );

  return {
    perSeatPricing: data?.perSeatPricing ?? null,
    isPerSeatPricingLoading: !error && !data && !disabled,
    isPerSeatPricingError: error,
  };
}

export function useWorkspaceVerifiedDomains({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const verifiedDomainsFetcher: Fetcher<GetWorkspaceVerifiedDomainsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/verified-domains`,
    verifiedDomainsFetcher,
    { disabled }
  );

  return {
    verifiedDomains: data?.verifiedDomains ?? emptyArray(),
    isVerifiedDomainsLoading: !error && !data && !disabled,
    isVerifiedDomainsError: error,
    mutateVerifiedDomains: mutate,
  };
}

export function useSubscriptionTrialInfo({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const trialInfoFetcher: Fetcher<GetSubscriptionTrialInfoResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/trial-info`,
    trialInfoFetcher,
    { disabled }
  );

  return {
    trialDaysRemaining: data?.trialDaysRemaining ?? null,
    isTrialInfoLoading: !error && !data && !disabled,
    isTrialInfoError: error,
  };
}

export function useWorkspaceSeatsCount({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const seatsCountFetcher: Fetcher<GetWorkspaceSeatsCountResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/seats/count`,
    seatsCountFetcher,
    { disabled }
  );

  return {
    seatsCount: data?.seatsCount ?? 0,
    isSeatsCountLoading: !error && !data && !disabled,
    isSeatsCountError: error,
    mutateSeatsCount: mutate,
  };
}
