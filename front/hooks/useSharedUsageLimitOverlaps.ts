import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSharedUsageLimitOverlapsResponseBody } from "@app/types/api/groups/shared_usage_limit";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";
import { mutate } from "swr";

export function sharedUsageLimitOverlapsUrl(
  workspaceId: string,
  groupId: string
) {
  return `/api/w/${workspaceId}/groups/${groupId}/shared_usage_limit/overlaps`;
}

export async function invalidateSharedUsageLimitOverlaps(workspaceId: string) {
  await mutate(
    (key) =>
      typeof key === "string" &&
      key.startsWith(`/api/w/${workspaceId}/groups/`) &&
      key.endsWith("/shared_usage_limit/overlaps")
  );
}

export function useSharedUsageLimitOverlaps({
  owner,
  groupId,
  disabled,
}: {
  owner: LightWorkspaceType;
  groupId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const overlapsFetcher: Fetcher<GetSharedUsageLimitOverlapsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    sharedUsageLimitOverlapsUrl(owner.sId, groupId),
    overlapsFetcher,
    { disabled }
  );

  return {
    overlaps: data?.groups ?? null,
    isOverlapsLoading: !error && !data && !disabled,
    isOverlapsError: !!error,
  };
}
