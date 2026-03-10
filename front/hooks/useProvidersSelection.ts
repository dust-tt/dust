import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  ALL_PROVIDERS_SELECTED,
  NO_PROVIDERS_SELECTED,
  type ProvidersSelection,
} from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import { useEffect, useMemo, useState } from "react";

export function useProvidersSelection(workspace: WorkspaceType | undefined) {
  const [providersSelection, setProvidersSelection] =
    useState<ProvidersSelection>(ALL_PROVIDERS_SELECTED);

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

  return { providersSelection, setProvidersSelection };
}
