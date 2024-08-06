// TRANSCRIPTS
export const labsTranscriptsProviders = ["google_drive", "gong"] as const;
export type LabsTranscriptsProviderType =
  (typeof labsTranscriptsProviders)[number];
export const minTranscriptsSize = 100;
