import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type {
  GetGroupAllowedModelTiersResponseBody,
  GetModelTiersResponseBody,
  GetUserAllowedModelTiersResponseBody,
  GetWorkspaceAllowedModelTiersResponseBody,
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

export function usePokeUserAllowedModelTiers({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const userAllowedModelTiersFetcher: Fetcher<GetUserAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/poke/workspaces/${owner.sId}/model_tiers/allowed/users`,
    userAllowedModelTiersFetcher
  );

  return {
    users: data?.users ?? emptyArray<UserAllowedModelTiersType>(),
    isUserAllowedModelTiersLoading: !error && !data && !disabled,
    isUserAllowedModelTiersError: !!error,
  };
}

export function usePokeGroupAllowedModelTiers({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const groupAllowedModelTiersFetcher: Fetcher<GetGroupAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/poke/workspaces/${owner.sId}/model_tiers/allowed/groups`,
    groupAllowedModelTiersFetcher
  );

  return {
    groups: data?.groups ?? emptyArray<GroupAllowedModelTiersType>(),
    isGroupAllowedModelTiersLoading: !error && !data && !disabled,
    isGroupAllowedModelTiersError: !!error,
  };
}

export function usePokeWorkspaceAllowedModelTiers({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const workspaceAllowedModelTiersFetcher: Fetcher<GetWorkspaceAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/poke/workspaces/${owner.sId}/model_tiers/allowed/workspace`,
    workspaceAllowedModelTiersFetcher
  );

  return {
    maxTierName: data?.maxTierName ?? null,
    isWorkspaceAllowedModelTiersLoading: !error && !data && !disabled,
    isWorkspaceAllowedModelTiersError: !!error,
  };
}
