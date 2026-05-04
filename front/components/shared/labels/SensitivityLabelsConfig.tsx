import { useDataClassificationLabels } from "@app/lib/swr/data_classification_labels";
import type { LightWorkspaceType } from "@app/types/user";
import type { Ref } from "react";
import { MicrosoftLabelsSelector } from "./MicrosoftLabelsSelector";
import type { LabelsHandle, SensitivityLabelSource } from "./types";

interface SensitivityLabelsConfigProps {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  labelsRef?: Ref<LabelsHandle>;
}

export function SensitivityLabelsConfig({
  owner,
  source,
  readOnly = false,
  onDirtyChange,
  labelsRef,
}: SensitivityLabelsConfigProps) {
  const {
    dataClassificationLabels,
    isDataClassificationLabelsLoading,
    isDataClassificationLabelsError,
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, source });

  return (
    <MicrosoftLabelsSelector
      ref={labelsRef}
      owner={owner}
      source={source}
      labels={dataClassificationLabels?.labels ?? []}
      savedAllowedLabels={dataClassificationLabels?.allowedLabels ?? []}
      onSaved={mutateDataClassificationLabels}
      readOnly={readOnly}
      hasError={!!isDataClassificationLabelsError}
      isLoading={isDataClassificationLabelsLoading}
      onDirtyChange={onDirtyChange}
    />
  );
}
