import type { ModelId, WhitelistableFeature } from "@app/types";

// Constants

export const labsTranscriptsProviders = [
  "google_drive",
  "gong",
  "modjo",
] as const;
export type LabsTranscriptsProviderType =
  (typeof labsTranscriptsProviders)[number];

export const labsFeatures = [
  "transcripts",
  "trackers",
  "salesforce_personal_connections",
] as const;
export type LabsFeatureType = (typeof labsFeatures)[number];

// Types

export type LabsTranscriptsConfigurationType = {
  id: ModelId;
  sId: string;
  workspaceId: ModelId;
  provider: LabsTranscriptsProviderType;
  agentConfigurationId: string | null;
  isActive: boolean;
  isDefaultWorkspaceConfiguration: boolean;
  credentialId: string | null;
  dataSourceViewId: ModelId | null;
  useConnectorConnection: boolean;
};

export type LabsFeatureItemType = {
  id: LabsFeatureType;
  featureFlag: WhitelistableFeature;
  visibleWithoutAccess: boolean;
  icon: React.ComponentType;
  label: string;
  description: string;
  onlyAdminCanManage?: boolean;
};

export enum SyncStatus {
  IDLE = "idle",
  IN_PROGRESS = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}
