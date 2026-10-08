import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { WHITELISTABLE_MODEL_MAKER_IDS } from "@app/types/assistant/models/providers";
import type { WhitelistableModelMakerIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import {
  ALL_PROVIDERS_SELECTED,
  NO_PROVIDERS_SELECTED,
} from "@app/types/provider_selection";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useProvidersSelection(
  workspace: WorkspaceType | undefined,
  owner: LightWorkspaceType,
  mutateWorkspace: () => Promise<unknown>
) {
  const { t } = useLingui();
  const [providersSelection, setProvidersSelection] =
    useState<ProvidersSelection>(ALL_PROVIDERS_SELECTED);
  const sendNotifications = useSendNotification();

  const enabledProviders: Readonly<WhitelistableModelMakerIdType[]> =
    workspace?.whiteListedProviders ?? WHITELISTABLE_MODEL_MAKER_IDS;

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

  const saveProviders = useCallback(
    async (
      newSelection: ProvidersSelection,
      previousSelection: ProvidersSelection
    ) => {
      setProvidersSelection(newSelection);
      try {
        const response = await clientFetch(`/api/w/${owner.sId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            whiteListedProviders: WHITELISTABLE_MODEL_MAKER_IDS.filter(
              (key) => newSelection[key]
            ),
            defaultEmbeddingProvider:
              workspace?.defaultEmbeddingProvider ?? null,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update workspace providers");
        }

        sendNotifications({
          type: "success",
          title: t`Providers updated`,
          description: t`The list of providers has been successfully updated.`,
        });

        await mutateWorkspace();
      } catch {
        setProvidersSelection(previousSelection);
        sendNotifications({
          type: "error",
          title: t`Update failed`,
          description: t`An unexpected error occurred while updating providers.`,
        });
      }
    },
    [
      owner.sId,
      workspace?.defaultEmbeddingProvider,
      mutateWorkspace,
      sendNotifications,
      t,
    ]
  );

  const toggleProvider = useCallback(
    async (provider: WhitelistableModelMakerIdType) => {
      const newSelection = {
        ...providersSelection,
        [provider]: !providersSelection[provider],
      };

      if (
        WHITELISTABLE_MODEL_MAKER_IDS.filter((key) => newSelection[key])
          .length === 0
      ) {
        sendNotifications({
          type: "error",
          title: t`One provider required`,
          description: t`Select at least one provider to continue with the update.`,
        });
        return;
      }

      await saveProviders(newSelection, providersSelection);
    },
    [providersSelection, saveProviders, sendNotifications, t]
  );

  const selectAllProviders = useCallback(async () => {
    await saveProviders(ALL_PROVIDERS_SELECTED, providersSelection);
  }, [providersSelection, saveProviders]);

  return {
    providersSelection,
    setProvidersSelection,
    toggleProvider,
    selectAllProviders,
  };
}
