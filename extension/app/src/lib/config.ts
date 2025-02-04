// Auth0 config.
export const AUTH0_CLIENT_DOMAIN = process.env.AUTH0_CLIENT_DOMAIN ?? "";
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? "";
export const AUTH0_AUDIENCE = `https://${AUTH0_CLIENT_DOMAIN}/api/v2/`;
export const AUTH0_PROFILE_ROUTE = `https://${AUTH0_CLIENT_DOMAIN}/userinfo`;
export const DUST_API_AUDIENCE = process.env.DUST_API_AUDIENCE ?? "";
export const AUTH0_CLAIM_NAMESPACE = process.env.AUTH0_CLAIM_NAMESPACE ?? "";
export const DEFAULT_DUST_API_DOMAIN =
  process.env.DEFAULT_DUST_API_DOMAIN ?? "";
