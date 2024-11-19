// Auth0 config.
export const AUTH0_CLIENT_DOMAIN = process.env.AUTH0_CLIENT_DOMAIN ?? "";
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? "";
export const AUTH0_AUDIENCE = `https://${AUTH0_CLIENT_DOMAIN}/api/v2/`;
export const AUTH0_PROFILE_ROUTE = `https://${AUTH0_CLIENT_DOMAIN}/userinfo`;
export const DUST_API_AUDIENCE = process.env.DUST_API_AUDIENCE ?? "";
