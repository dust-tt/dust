import { EnvironmentConfig } from "@marketing/types/shared/utils/config";

const config = {
  // Dynamic API base URL: falls back to NEXT_PUBLIC_DUST_API_URL, with overrides
  // for the internal API URL used by `front-internal` so that upload URLs returned
  // by the file API point at the internal service rather than the public host.
  getApiBaseUrl: (): string => {
    let override = EnvironmentConfig.getOptionalEnvVariable(
      "DUST_INTERNAL_API_URL"
    );
    if (override) {
      return override;
    }

    // Remove this when transitioned to DUST_INTERNAL_API_URL
    override = EnvironmentConfig.getOptionalEnvVariable(
      "DUST_INTERNAL_CLIENT_FACING_URL"
    );
    if (override) {
      return override;
    }

    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_DUST_API_URL) {
      throw new Error("NEXT_PUBLIC_DUST_API_URL is not set");
    }
    return process.env.NEXT_PUBLIC_DUST_API_URL;
  },
  // URL for the main app pages (/w/..., /share/..., etc.).
  // Use this for page URLs, not API endpoints.
  getAppUrl: (): string => {
    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_DUST_APP_URL) {
      throw new Error("NEXT_PUBLIC_DUST_APP_URL is required");
    }

    return process.env.NEXT_PUBLIC_DUST_APP_URL;
  },
  getIPInfoApiToken: (): string => {
    return EnvironmentConfig.getEnvVariable("IPINFO_API_TOKEN");
  },
  getContentfulSpaceId: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_SPACE_ID");
  },
  getContentfulAccessToken: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_ACCESS_TOKEN");
  },
  getContentfulPreviewSecret: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "CONTENTFUL_PREVIEW_SECRET"
    );
  },
  getContentfulPreviewToken: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_PREVIEW_TOKEN");
  },
  // Secret for signing gated asset download tokens (ebooks, whitepapers, etc.).
  getGatedAssetsTokenSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("GATED_ASSETS_TOKEN_SECRET");
  },
};

export default config;
