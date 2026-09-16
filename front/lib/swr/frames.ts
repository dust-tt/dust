import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetFramePermissionsResponseBody } from "@app/types/api/frame_permissions";
import type { EditTextFn } from "@app/types/assistant/visualization";
import { normalizeAsInternalDustError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useFramePermissions({
  owner,
  frameId,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  frameId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const permissionsFetcher: Fetcher<GetFramePermissionsResponseBody> = fetcher;
  const swrKey = disabled
    ? null
    : `/api/w/${owner.sId}/frames/${encodeURIComponent(frameId)}/permissions`;

  const { data, error } = useSWRWithDefaults(swrKey, permissionsFetcher, {
    disabled,
    revalidateOnFocus: false,
  });

  return {
    isFrameAuthor: data?.isFrameAuthor ?? false,
    isFramePermissionsLoading: !disabled && !data && !error,
    isFramePermissionsError: error,
  };
}

export function useEditFrameText({
  conversationId,
  fileId,
  owner,
}: {
  conversationId?: string;
  fileId: string;
  owner: LightWorkspaceType;
}): EditTextFn {
  return useCallback(
    async ({ newText, oldText, targetFileId, source }) => {
      try {
        // Location-based edits address the published entry Frame; legacy context edits route
        // to the nested target file.
        const editFileId = source ? fileId : (targetFileId ?? fileId);
        const response = await clientFetch(
          `/api/w/${owner.sId}/files/${encodeURIComponent(editFileId)}/edit-text`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, newText, oldText, source }),
          }
        );
        if (!response.ok) {
          const errorData = await getErrorFromResponse(response);
          return { success: false, error: errorData.message };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: normalizeAsInternalDustError(error).message,
        };
      }
    },
    [conversationId, fileId, owner.sId]
  );
}

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
    // Set only when the viewer can read the Pod; null for a Frame outside one.
    framePath: data?.framePath ?? null,
    // Set only if user is a conversation participant.
    conversationUrl: data?.conversationUrl ?? null,
    // Set only if user can read the project.
    projectUrl: data?.projectUrl ?? null,
    accessToken: data?.accessToken ?? null,
    isFrameLoading: !error && !data,
    isAuthenticatedMember: data?.isAuthenticatedMember ?? false,
    isPodMember: data?.isPodMember ?? false,
    isPodEditor: data?.isPodEditor ?? false,
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
