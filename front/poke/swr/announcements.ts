import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeAnnouncementResponseBody } from "@app/pages/api/poke/announcements/[aId]";
import type { GetPokeAnnouncementsResponseBody } from "@app/pages/api/poke/announcements/index";
import type { AnnouncementType } from "@app/types/announcement";

export function usePokeAnnouncements({
  type,
  isPublished,
  disabled,
}: {
  type?: AnnouncementType;
  isPublished?: boolean;
  disabled?: boolean;
} = {}) {
  const params = new URLSearchParams();
  if (type) params.append("type", type);
  if (isPublished !== undefined)
    params.append("isPublished", String(isPublished));

  const url = `/api/poke/announcements${params.toString() ? `?${params.toString()}` : ""}`;

  const announcementsFetcher: Fetcher<GetPokeAnnouncementsResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    url,
    announcementsFetcher,
    { disabled }
  );

  return {
    announcements: data?.announcements ?? [],
    total: data?.total ?? 0,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeAnnouncement({
  aId,
  disabled,
}: {
  aId: string | null;
  disabled?: boolean;
}) {
  const announcementFetcher: Fetcher<GetPokeAnnouncementResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    aId ? `/api/poke/announcements/${aId}` : null,
    announcementFetcher,
    { disabled }
  );

  return {
    announcement: data?.announcement,
    isLoading: !error && !data && !disabled && aId !== null,
    isError: error,
    mutate,
  };
}
