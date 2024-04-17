// Generic solution related types are all here because we don't want to splash on any other part of the product.
// Specific solutions types are in their respective folders.

// GENERAL
export const labsTranscriptsProviders = ["google_drive", "gong"] as const;
export type LabsTranscriptsProviderType =
  (typeof labsTranscriptsProviders)[number];
export type NangoConnectionId = string;
export type NangoIntegrationId = string;
