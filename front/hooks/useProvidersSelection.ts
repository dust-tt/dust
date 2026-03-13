import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  ALL_PROVIDERS_SELECTED,
  NO_PROVIDERS_SELECTED,
  type ProvidersSelection,
} from "@app/types/provider_selection";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useProvidersSelection(
  workspace: WorkspaceType | undefined,
  owner: LightWorkspaceType,
  mutateWorkspace: () => Promise<unknown>
) {
  const [providersSelection, setProvidersSelection] =
    useState<ProvidersSelection>(ALL_PROVIDERS_SELECTED);
  const sendNotifications = useSendNotification();

  const enabledProviders: Readonly<ModelProviderIdType[]> =
    workspace?.whiteListedProviders ?? MODEL_PROVIDER_IDS;

  const initialProvidersSelection = useMemo(
    () =>
      enabledProviders.reduce(
        (acc, provider) => ({ ...acc, [provider]: true }),
        NO_PROVIDERS_SELECTED
      ),
    [enabledProviders]
  );

  useEffect(() => {
    setProvidersSelection(initialProvidersSelection);
  }, [initialProvidersSelection]);

  const toggleProvider = useCallback(
    async (provider: ModelProviderIdType) => {
      const newSelection = {
        ...providersSelection,
        [provider]: !providersSelection[provider],
      };
      const activeProviders = MODEL_PROVIDER_IDS.filter(
        (key) => newSelection[key]
      );

      if (activeProviders.length === 0) {
        sendNotifications({
          type: "error",
          title: "One provider required",
          description:
            "Please select at least one provider to continue with the update.",
        });
        return;
      }

      setProvidersSelection(newSelection);

      try {
        const response = await clientFetch(`/api/w/${owner.sId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            whiteListedProviders: activeProviders,
            defaultEmbeddingProvider:
              workspace?.defaultEmbeddingProvider ?? null,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update workspace providers");
        }

        sendNotifications({
          type: "success",
          title: "Providers Updated",
          description: "The list of providers has been successfully updated.",
        });

        await mutateWorkspace();
      } catch {
        setProvidersSelection(providersSelection);
        sendNotifications({
          type: "error",
          title: "Update Failed",
          description: "An unexpected error occurred while updating providers.",
        });
      }
    },
    [
      owner.sId,
      providersSelection,
      workspace?.defaultEmbeddingProvider,
      mutateWorkspace,
      sendNotifications,
    ]
  );

  return { providersSelection, setProvidersSelection, toggleProvider };
}
