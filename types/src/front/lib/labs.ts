// TRANSCRIPTS
export const labsTranscriptsProviders = ["google_drive", "gong"] as const;
export type LabsTranscriptsProviderType =
  (typeof labsTranscriptsProviders)[number];
export type NangoConnectionId = string;
export type NangoIntegrationId = string;
