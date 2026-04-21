import { useDataClassificationLabels } from "@app/lib/swr/data_classification_labels";
import type { LightWorkspaceType } from "@app/types/user";
import { MicrosoftLabelsSelector } from "./MicrosoftLabelsSelector";
import type { SensitivityLabelSource } from "./types";

interface SensitivityLabelsConfigProps {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  readOnly?: boolean;
  isAdmin: boolean;
}

export function SensitivityLabelsConfig({
  owner,
  source,
  readOnly = false,
  isAdmin,
}: SensitivityLabelsConfigProps) {
  const {
    dataClassificationLabels,
    isDataClassificationLabelsLoading,
    isDataClassificationLabelsError,
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, source });

  if (isDataClassificationLabelsLoading) {
    return null;
  }

  return (
    <MicrosoftLabelsSelector
      owner={owner}
      source={source}
      labels={dataClassificationLabels?.labels ?? []}
      savedAllowedLabels={dataClassificationLabels?.allowedLabels ?? []}
      onSaved={mutateDataClassificationLabels}
      readOnly={readOnly}
      isAdmin={isAdmin}
      hasError={!!isDataClassificationLabelsError}
    />
  );
}
