export const AUTH = process.env.AUTH ?? "auth0";
export const DUST_API_AUDIENCE = process.env.DUST_API_AUDIENCE ?? "";
// Auth0 config.
export const AUTH0_CLIENT_DOMAIN = process.env.AUTH0_CLIENT_DOMAIN ?? "";
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? "";
export const AUTH0_AUDIENCE = `https://${AUTH0_CLIENT_DOMAIN}/api/v2/`;
export const AUTH0_PROFILE_ROUTE = `https://${AUTH0_CLIENT_DOMAIN}/userinfo`;
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
