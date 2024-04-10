// Generic solution related types are all here because we don't want to splash on any other part of the product.
// Specific solutions types are in their respective folders.

// GENERAL
export type LabsTranscriptsProviderType = "google_drive" | "gong" | null;

// NANGO
export type NangoConnectionId = string;
export type NangoConnectionResponse = {
  connection_id: string;
  credentials: {
    type: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    expires_in: number;
    raw: {
      scope: string;
      token_type: string;
    };
  };
};
