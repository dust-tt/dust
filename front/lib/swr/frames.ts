// This hook uses a public API endpoint, so it's fine to use the client types.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

export function usePublicFrame({ shareToken }: { shareToken: string | null }) {
  const frameMetadataFetcher: Fetcher<PublicFrameResponseBodyType> = fetcher;

  const swrKey = shareToken ? `/api/v1/public/frames/${shareToken}` : null;

  const { data, error, mutate } = useSWRWithDefaults(
    swrKey,
    frameMetadataFetcher,
    {
      disabled: !shareToken,
      revalidateOnFocus: false,
    }
  );

  return {
    frameMetadata: data?.file,
    // Set only if user is a conversation participant.
    conversationUrl: data?.conversationUrl ?? null,
    accessToken: data?.accessToken ?? null,
    isFrameLoading: !error && !data,
    error,
    mutateFrame: mutate,
  };
}
