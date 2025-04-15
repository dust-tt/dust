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

export const labsConnections = ["hubspot", "linear"] as const;
export type LabsConnectionType = (typeof labsConnections)[number];

// Types

export type LabsTranscriptsConfigurationType = {
  id: ModelId;
  workspaceId: ModelId;
  connectionId: string | null;
  provider: LabsTranscriptsProviderType;
  agentConfigurationId: string | null;
  isActive: boolean;
  isDefaultWorkspaceConfiguration: boolean;
  credentialId: string | null;
  dataSourceViewId: ModelId | null;
  useConnectorConnection: boolean;
};

export type LabsConnectionAuthType = "apiKey" | "oauth" | "email_password";

export type LabsConnectionItemType = {
  id: LabsConnectionType;
  featureFlag: WhitelistableFeature;
  visibleWithoutAccess: boolean;
  logo: React.ComponentType;
  label: string;
  description: string;
  authType: LabsConnectionAuthType;
};

export type LabsFeatureItemType = {
  id: LabsFeatureType;
  featureFlag: WhitelistableFeature;
  visibleWithoutAccess: boolean;
  icon: React.ComponentType;
  label: string;
  description: string;
};

export enum SyncStatus {
  IDLE = "idle",
  IN_PROGRESS = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}
