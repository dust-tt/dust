export type SensitivityLabelSource =
  | { dataSourceId: string; internalMCPServerId?: never }
  | { internalMCPServerId: string; dataSourceId?: never };
