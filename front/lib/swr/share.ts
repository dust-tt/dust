import { useRegionContextSafe } from "@app/lib/auth/RegionContext";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { isRegionRedirect } from "@app/lib/swr/workspaces";
import type { GetShareFrameMetadataResponseBody } from "@app/pages/api/share/frame/[token]";
import { useEffect } from "react";
import type { Fetcher } from "swr";

export function useShareFrameMetadata({
  shareToken,
}: {
  shareToken: string | null;
}) {
  const { fetcher } = useFetcher();
  const shareMetadataFetcher: Fetcher<GetShareFrameMetadataResponseBody> =
    fetcher;
  const regionContext = useRegionContextSafe();

  const swrKey = shareToken ? `/api/share/frame/${shareToken}` : null;

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    swrKey,
    shareMetadataFetcher,
    {
      disabled: !shareToken,
      revalidateOnFocus: false,
    }
  );

  const isRegionRedirectResponse = error && isRegionRedirect(error.error);
  const regionRedirect = isRegionRedirectResponse
    ? error.error.redirect
    : undefined;

  // Handle region redirect.
  useEffect(() => {
    if (regionRedirect && regionContext) {
      regionContext.setRegionInfo({
        name: regionRedirect.region,
        url: regionRedirect.url,
      });
      void mutate();
    }
  }, [regionRedirect, mutate, regionContext]);

  return {
    shareMetadata: isRegionRedirectResponse ? undefined : data,
    isShareMetadataLoading: isLoading || !!isRegionRedirectResponse,
    shareMetadataError: isRegionRedirectResponse ? undefined : error,
  };
}
