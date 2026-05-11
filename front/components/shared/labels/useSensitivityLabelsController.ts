import { useSendNotification } from "@app/hooks/useNotification";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import {
  saveDataClassificationLabels,
  useDataClassificationLabels,
} from "@app/lib/swr/data_classification_labels";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SensitivityLabelSource,
  SensitivityLabelsController,
} from "./types";

function labelsKey(labels: Iterable<string>): string {
  return JSON.stringify(Array.from(labels).sort());
}

export function useSensitivityLabelsController({
  owner,
  source,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  disabled?: boolean;
}): SensitivityLabelsController {
  const sendNotification = useSendNotification();
  const {
    dataClassificationLabels,
    isDataClassificationLabelsLoading,
    isDataClassificationLabelsError,
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, source, disabled });

  const labels = dataClassificationLabels?.labels ?? [];
  const savedAllowedLabels: MicrosoftAllowedLabel[] =
    dataClassificationLabels?.allowedLabels ?? [];
  const savedAllowedLabelsKey = useMemo(
    () => labelsKey(savedAllowedLabels),
    [savedAllowedLabels]
  );
  const stableSavedAllowedLabels = useMemo(
    () => JSON.parse(savedAllowedLabelsKey) as MicrosoftAllowedLabel[],
    [savedAllowedLabelsKey]
  );

  const [pendingSelected, setPendingSelected] = useState<Set<string>>(
    new Set()
  );
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const reset = useCallback(() => {
    setPendingSelected(new Set(stableSavedAllowedLabels));
    setIsEnabled(stableSavedAllowedLabels.length > 0);
  }, [stableSavedAllowedLabels]);

  useEffect(() => {
    if (disabled || isDataClassificationLabelsLoading) {
      return;
    }
    reset();
  }, [disabled, isDataClassificationLabelsLoading, reset]);

  const pendingAllowedLabels = useMemo(
    () => (isEnabled ? Array.from(pendingSelected) : []),
    [isEnabled, pendingSelected]
  );
  const isDirty = labelsKey(pendingAllowedLabels) !== savedAllowedLabelsKey;

  const save = useCallback(async () => {
    if (disabled || !isDirty) {
      return true;
    }

    setIsSaving(true);
    try {
      const result = await saveDataClassificationLabels({
        owner,
        source,
        allowedLabels: pendingAllowedLabels,
      });
      if (result.success) {
        await mutateDataClassificationLabels();
        return true;
      }

      sendNotification({
        type: "error",
        title: "Failed to update labels setting",
        description: result.error,
      });
      return false;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update sensitivity labels setting",
        description:
          error instanceof Error ? error.message : "An unknown error occurred.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    disabled,
    isDirty,
    mutateDataClassificationLabels,
    owner,
    pendingAllowedLabels,
    sendNotification,
    source,
  ]);

  return {
    labels,
    savedAllowedLabels,
    pendingSelected,
    isEnabled,
    isDirty,
    isLoading: isDataClassificationLabelsLoading,
    isSaving,
    hasError: !!isDataClassificationLabelsError,
    setIsEnabled,
    setPendingSelected,
    save,
    reset,
  };
}
