export const AUTH = process.env.AUTH ?? "auth0";
export const DUST_API_AUDIENCE = process.env.DUST_API_AUDIENCE ?? "";

// Auth0 config.
export const AUTH0_CLIENT_DOMAIN = process.env.AUTH0_CLIENT_DOMAIN ?? "";
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? "";
export const AUTH0_AUDIENCE = `https://${AUTH0_CLIENT_DOMAIN}/api/v2/`;
export const AUTH0_PROFILE_ROUTE = `https://${AUTH0_CLIENT_DOMAIN}/userinfo`;
export const AUTH0_CLAIM_NAMESPACE = process.env.AUTH0_CLAIM_NAMESPACE ?? "";

// WorkOS config.
export const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID ?? "";
export const WORKOS_DOMAIN =
  process.env.WORKOS_DOMAIN ?? "https://api.workos.com";

export const getOAuthClientID = () =>
  AUTH === "auth0" ? AUTH0_CLIENT_ID : WORKOS_CLIENT_ID;
export const getAuthorizeURL = (queryString: string) =>
  AUTH === "auth0"
    ? `https://${AUTH0_CLIENT_DOMAIN}/authorize?${queryString}`
    : `https://${WORKOS_DOMAIN}/user_management/authorize?${queryString}`;
export const getTokenURL = () =>
  AUTH === "auth0"
    ? `https://${AUTH0_CLIENT_DOMAIN}/oauth/token`
    : `https://${WORKOS_DOMAIN}/user_management/authenticate`;

export const DUST_US_URL = process.env.DUST_US_URL ?? "";
export const DUST_EU_URL = process.env.DUST_EU_URL ?? "";
export const DEFAULT_DUST_API_DOMAIN =
  process.env.DEFAULT_DUST_API_DOMAIN ?? "";
export const FRONT_EXTENSION_URL = process.env.FRONT_EXTENSION_URL ?? "";
