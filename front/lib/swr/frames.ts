// This hook uses a public API endpoint, so it's fine to use the client types.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import { useCallback } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

export function usePublicFrame({ shareToken }: { shareToken: string | null }) {
  const frameMetadataFetcher: Fetcher<PublicFrameResponseBodyType> = fetcher;

  const swrKey = shareToken ? `/api/v1/public/frames/${shareToken}` : null;

  const { data, error, mutate } = useSWRWithDefaults(
    swrKey,
    frameMetadataFetcher,
    { disabled: !shareToken }
  );

  return {
    frameMetadata: data?.file,
    frameContent: data?.content,
    // Set only if user is a conversation participant.
    conversationUrl: data?.conversationUrl ?? null,
    isFrameLoading: !error && !data,
    error,
    mutateFrame: mutate,
  };
}

export function usePublicFrameFileBlob({ frameToken }: { frameToken: string }) {
  const fetchFileBlob = useCallback(
    async ({ fileId, signal }: { fileId: string; signal?: AbortSignal }) => {
      const url = `/api/v1/public/frames/${frameToken}/files/${fileId}`;
      const res = await fetch(url, { method: "GET", signal });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Failed to fetch file ${fileId}`);
      }

      const buf = await res.arrayBuffer();
      const ct = res.headers.get("Content-Type") ?? undefined;
      return new Blob([buf], { type: ct });
    },
    [frameToken]
  );

  return { fetchFileBlob };
}
