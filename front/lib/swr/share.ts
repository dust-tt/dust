import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetShareFrameMetadataResponseBody } from "@app/pages/api/share/frame/[token]";

export function useShareFrameMetadata({
  shareToken,
}: {
  shareToken: string | null;
}) {
  const shareMetadataFetcher: Fetcher<GetShareFrameMetadataResponseBody> =
    fetcher;

  const swrKey = shareToken ? `/api/share/frame/${shareToken}` : null;

  const { data, error, isLoading } = useSWRWithDefaults(
    swrKey,
    shareMetadataFetcher,
    {
      disabled: !shareToken,
      revalidateOnFocus: false,
    }
  );

  return {
    shareMetadata: data,
    isShareMetadataLoading: isLoading,
    shareMetadataError: error,
  };
}
