import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { SandboxKillImagesResponseBody } from "@app/pages/api/poke/sandbox_kill/images";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeSandboxKillImages() {
  const { fetcher } = useFetcher();
  const imagesFetcher: Fetcher<SandboxKillImagesResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/sandbox_kill/images",
    imagesFetcher
  );

  return {
    images: data?.images ?? emptyArray(),
    isImagesLoading: !error && !data,
    isImagesError: error,
    mutateImages: mutate,
  };
}
