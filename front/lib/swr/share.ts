import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetShareFrameMetadataResponseBody } from "@app/pages/api/share/frame/[token]";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useShareFrameMetadata({
  shareToken,
}: {
  shareToken: string | null;
}) {
  const { fetcher } = useFetcher();
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

interface OtpResult {
  error?: string;
  success: boolean;
}

export function useSendOtpVerification({ shareToken }: { shareToken: string }) {
  const doSendOtp = useCallback(
    async (email: string): Promise<OtpResult> => {
      const res = await clientFetch(
        `/api/v1/public/frames/${shareToken}/verify-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );

      if (res.ok) {
        return { success: true };
      }

      if (res.status === 429) {
        return {
          success: false,
          error: "Too many requests. Please try again later.",
        };
      }

      const errorData = await getErrorFromResponse(res);
      return { success: false, error: errorData.message };
    },
    [shareToken]
  );

  return doSendOtp;
}

export function useVerifyOtpCode({ shareToken }: { shareToken: string }) {
  const doVerifyCode = useCallback(
    async (email: string, code: string): Promise<OtpResult> => {
      const res = await clientFetch(
        `/api/v1/public/frames/${shareToken}/verify-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        }
      );

      if (res.ok) {
        return { success: true };
      }

      const errorData = await getErrorFromResponse(res);
      return { success: false, error: errorData.message };
    },
    [shareToken]
  );

  return doVerifyCode;
}
