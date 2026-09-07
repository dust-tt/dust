import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type {
  GetModelTiersResponseBody,
  GetPokeAllowedModelTiersResponseBody,
  GroupAllowedModelTiersType,
  UserAllowedModelTiersType,
} from "@app/types/api/model_tiers";
import type { Fetcher } from "swr";

// Read-only Poke mirrors of the customer-facing hooks in
// `lib/swr/model_tiers.ts` — Poke's Pool Usage page only displays the models
// tier column, it never edits it, so there are no mutation hooks here.

export function usePokeModelTiers({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const modelTiersFetcher: Fetcher<GetModelTiersResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled ? null : `/api/poke/workspaces/${owner.sId}/model_tiers`,
    modelTiersFetcher
  );

  return {
    tiers: data?.tiers ?? emptyArray(),
    isModelTiersLoading: !error && !data && !disabled,
    isModelTiersError: !!error,
  };
}

export function usePokeAllowedModelTiers({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const allowedModelTiersFetcher: Fetcher<GetPokeAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled ? null : `/api/poke/workspaces/${owner.sId}/model_tiers/allowed`,
    allowedModelTiersFetcher
  );

  return {
    users: data?.users ?? emptyArray<UserAllowedModelTiersType>(),
    groups: data?.groups ?? emptyArray<GroupAllowedModelTiersType>(),
    maxTierName: data?.maxTierName ?? null,
    isAllowedModelTiersLoading: !error && !data && !disabled,
    isAllowedModelTiersError: !!error,
  };
}
