import type { MicrosoftSensitivityLabel } from "@app/lib/api/data_classification_labels";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";

export type SensitivityLabelSource =
  | { dataSourceId: string; internalMCPServerId?: never }
  | { internalMCPServerId: string; dataSourceId?: never };

export interface SensitivityLabelsControllerState {
  labels: MicrosoftSensitivityLabel[];
  savedAllowedLabels: MicrosoftAllowedLabel[];
  pendingSelected: Set<string>;
  isEnabled: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  hasError: boolean;
}

export interface SensitivityLabelsControllerActions {
  setIsEnabled: (enabled: boolean) => void;
  setPendingSelected: (selected: Set<string>) => void;
  save: () => Promise<boolean>;
  reset: () => void;
}

export type SensitivityLabelsController = SensitivityLabelsControllerState &
  SensitivityLabelsControllerActions;
