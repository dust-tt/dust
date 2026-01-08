// Mobile-specific config overrides for development
// In production, these should come from environment variables

// Re-export shared config but override with mobile-specific values
import * as sharedConfig from "@app/shared/lib/config";

// For mobile development, use localhost
export const DUST_US_URL = sharedConfig.DUST_US_URL || "http://localhost:3000";
export const DUST_EU_URL = sharedConfig.DUST_EU_URL || "https://eu.dust.tt";
export const DEFAULT_DUST_API_DOMAIN =
  sharedConfig.DEFAULT_DUST_API_DOMAIN || DUST_US_URL;

// WorkOS claim namespace for JWT parsing
export const WORKOS_CLAIM_NAMESPACE =
  sharedConfig.WORKOS_CLAIM_NAMESPACE || "https://dust.tt/";
