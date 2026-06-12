import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { UserUploadableBrandingAssetName } from "@app/lib/api/workspace_branding";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

interface BrandingAssetState {
  version: string;
}

interface WorkspaceBrandingData {
  assets: {
    logo: BrandingAssetState | null;
    favicon: BrandingAssetState | null;
    og: BrandingAssetState | null;
  };
}

interface GetWorkspaceBrandingResponseBody {
  branding: WorkspaceBrandingData;
}

export function useWorkspaceBranding({
  owner,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const brandingFetcher: Fetcher<GetWorkspaceBrandingResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : `/api/w/${owner.sId}/branding`,
    brandingFetcher,
    { disabled }
  );

  return {
    branding: data?.branding ?? null,
    isBrandingLoading: !error && !data && !disabled,
    isBrandingError: !!error,
    mutateBranding: mutate,
  };
}

export function usePromoteWorkspaceBrandingAsset({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const promoteAsset = useCallback(
    async (
      asset: UserUploadableBrandingAssetName,
      fileId: string | null
    ): Promise<boolean> => {
      const res = await clientFetch(`/api/w/${owner.sId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, fileId }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Failed to update branding",
          description: "An error occurred while saving the branding asset.",
        });

        return false;
      }

      return true;
    },
    [owner.sId, sendNotification]
  );

  return { promoteAsset };
}
