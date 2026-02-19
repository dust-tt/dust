import type { WhitelistableFeature } from "./shared/feature_flags";
import type { ModelId } from "./shared/model_id";

// Constants

export const labsTranscriptsProviders = [
  "google_drive",
  "gong",
  "modjo",
] as const;
export type LabsTranscriptsProviderType =
  (typeof labsTranscriptsProviders)[number];

export const LABS_TRANSCRIPTS_CONFIGURATION_STATUSES = [
  "active",
  "disabled",
  "relocating",
] as const;
export type LabsTranscriptsConfigurationStatus =
  (typeof LABS_TRANSCRIPTS_CONFIGURATION_STATUSES)[number];

export function isValidLabsTranscriptsConfigurationStatus(
  status: string
): status is LabsTranscriptsConfigurationStatus {
  return (
    LABS_TRANSCRIPTS_CONFIGURATION_STATUSES as readonly string[]
  ).includes(status);
}

export const labsFeatures = [
  "transcripts",
  "mcp_actions",
  "transcription",
] as const;
export type LabsFeatureType = (typeof labsFeatures)[number];

// Types

export type LabsTranscriptsConfigurationType = {
  id: ModelId;
  sId: string;
  workspaceId: ModelId;
  provider: LabsTranscriptsProviderType;
  agentConfigurationId: string | null;
  status: LabsTranscriptsConfigurationStatus;
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
