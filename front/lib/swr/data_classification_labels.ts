import { clientFetch } from "@app/lib/egress/client";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { DataClassificationLabelsResponseBody } from "@app/pages/api/w/[wId]/data-classification-labels";
import type { LightWorkspaceType } from "@app/types/user";

function buildKey(
  owner: LightWorkspaceType,
  source:
    | { dataSourceId: string; internalMCPServerName?: never }
    | { internalMCPServerName: string; dataSourceId?: never }
): string {
  if (source.dataSourceId !== undefined) {
    return `/api/w/${owner.sId}/data-classification-labels?dataSourceId=${source.dataSourceId}`;
  }
  return `/api/w/${owner.sId}/data-classification-labels?internalMCPServerName=${source.internalMCPServerName}`;
}

export function useDataClassificationLabels({
  owner,
  dataSourceId,
  internalMCPServerName,
}: {
  owner: LightWorkspaceType;
} & (
  | { dataSourceId: string; internalMCPServerName?: never }
  | { internalMCPServerName: string; dataSourceId?: never }
)) {
  const { fetcher } = useFetcher();
  const key = buildKey(
    owner,
    dataSourceId !== undefined
      ? { dataSourceId }
      : { internalMCPServerName: internalMCPServerName! }
  );
  const { data, error, mutate } = useSWRWithDefaults<
    string,
    DataClassificationLabelsResponseBody
  >(key, fetcher);

  return {
    dataClassificationLabels: data,
    isDataClassificationLabelsLoading: !error && !data,
    isDataClassificationLabelsError: error,
    mutateDataClassificationLabels: mutate,
  };
}

export async function saveDataClassificationLabels({
  owner,
  dataSourceId,
  internalMCPServerName,
  allowedLabels,
}: {
  owner: LightWorkspaceType;
  allowedLabels: MicrosoftAllowedLabel[];
} & (
  | { dataSourceId: string; internalMCPServerName?: never }
  | { internalMCPServerName: string; dataSourceId?: never }
)): Promise<{ success: boolean; error?: string }> {
  const body: Record<string, unknown> = { allowedLabels };
  if (dataSourceId !== undefined) {
    body.dataSourceId = dataSourceId;
  } else {
    body.internalMCPServerName = internalMCPServerName;
  }

  const response = await clientFetch(
    `/api/w/${owner.sId}/data-classification-labels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error:
        errorData?.error?.message ??
        "Failed to save data classification labels.",
    };
  }

  return { success: true };
}
