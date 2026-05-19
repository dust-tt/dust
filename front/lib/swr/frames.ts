// This hook uses a public API endpoint, so it's fine to use the client types.

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import type { Fetcher } from "swr";

export function usePublicFrame({ shareToken }: { shareToken: string | null }) {
  const { fetcher } = useFetcher();
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
    // Set only if user can read the project.
    projectUrl: data?.projectUrl ?? null,
    accessToken: data?.accessToken ?? null,
    isFrameLoading: !error && !data,
    error,
    mutateFrame: mutate,
  };
}

export function useExportFrameAsPdf({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();

  return async ({
    fileId,
    fileName,
    orientation,
  }: {
    fileId: string;
    fileName?: string;
    orientation: "portrait" | "landscape";
  }): Promise<boolean> => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/files/${fileId}/export/pdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orientation }),
      }
    );

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "PDF Export Failed",
        description: errorData.message,
      });
      return false;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName?.replace(/\.[^.]+$/, ".pdf") ?? "frame.pdf";
    link.click();
    URL.revokeObjectURL(url);

    sendNotification({
      type: "success",
      title: "PDF exported",
      description: "Your PDF has been downloaded.",
    });
    return true;
  };
}
