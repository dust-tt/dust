import type { ModelId } from "@app/types";

export type LabsTranscriptsConfigurationType = {
  id: ModelId;
  workspaceId: ModelId;
  connectionId: string | null;
  provider: "google_drive" | "gong" | "modjo";
  agentConfigurationId: string | null;
  isActive: boolean;
  isDefaultWorkspaceConfiguration: boolean;
  credentialId: string | null;
  dataSourceViewId: ModelId | null;
  useConnectorConnection: boolean;
};
// TRANSCRIPTS
export const labsTranscriptsProviders = [
  "google_drive",
  "gong",
  "modjo",
] as const;
export type LabsTranscriptsProviderType =
  (typeof labsTranscriptsProviders)[number];
