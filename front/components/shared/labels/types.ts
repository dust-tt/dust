export type SensitivityLabelSource =
  | { dataSourceId: string; internalMCPServerId?: never }
  | { internalMCPServerId: string; dataSourceId?: never };

export interface LabelsHandle {
  isDirty: boolean;
  save: () => Promise<boolean>;
}
