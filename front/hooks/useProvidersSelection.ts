import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  ALL_PROVIDERS_SELECTED,
  NO_PROVIDERS_SELECTED,
  type ProvidersSelection,
} from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import identity from "lodash/identity";
import keyBy from "lodash/keyBy";
import mapValues from "lodash/mapValues";
import { useEffect, useMemo, useState } from "react";

export function useProvidersSelection(workspace: WorkspaceType | undefined) {
  const [providersSelection, setProvidersSelection] =
    useState<ProvidersSelection>(ALL_PROVIDERS_SELECTED);

  const enabledProviders: Readonly<ModelProviderIdType[]> =
    workspace?.whiteListedProviders ?? MODEL_PROVIDER_IDS;

  const initialProvidersSelection = useMemo(
    () => ({
      ...NO_PROVIDERS_SELECTED,
      ...mapValues(keyBy(enabledProviders, identity), () => true),
    }),
    [enabledProviders]
  );

  useEffect(() => {
    setProvidersSelection(initialProvidersSelection);
  }, [initialProvidersSelection]);

  return { providersSelection, setProvidersSelection };
}
