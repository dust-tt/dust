import type { Auth0Client, Auth0ClientOptions } from "@auth0/auth0-spa-js";
import { createAuth0Client } from "@auth0/auth0-spa-js";

// Auth0 config.
export const AUTH0_CLIENT_DOMAIN = process.env.AUTH0_CLIENT_DOMAIN ?? "";
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? "";
export const AUTH0_AUDIENCE = `https://${AUTH0_CLIENT_DOMAIN}/api/v2/`;
export const AUTH0_PROFILE_ROUTE = `https://${AUTH0_CLIENT_DOMAIN}/userinfo`;

export type Auth0AuthorizeResponse = {
  idToken: string | null;
  accessToken: string | null;
  expiresIn: string | null;
};

export type AuthBackgroundResponse = {
  success: boolean;
};

export type AuthBackroundMessage = {
  type: "AUTHENTICATE" | "LOGOUT";
};

let auth0Client: Auth0Client | null = null;

const getAuth0Client = async (): Promise<Auth0Client> => {
  if (!auth0Client) {
    auth0Client = await createClient();
  }
  return auth0Client;
};

const createClient = async (): Promise<Auth0Client> => {
  const options: Auth0ClientOptions = {
    domain: AUTH0_CLIENT_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    useRefreshTokens: true,
    cacheLocation: "memory", // Changed from 'localstorage'
    authorizationParams: {
      redirect_uri: chrome.identity.getRedirectURL(),
    },
  };

  // Create a custom cache
  const storage = {
    get: async (key: string) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (result) => {
          resolve(result[key] || null);
        });
      });
    },
    set: async (key: string, value: any) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => {
          resolve();
        });
      });
    },
    remove: async (key: string) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.remove(key, () => {
          resolve();
        });
      });
    },
  };

  return await createAuth0Client({
    ...options,
    // @ts-expect-error: Ignore the type mismatch for cache
    cache: storage,
    cookieStorage: storage,
    useCookiesForTransactions: false,
  });
};

export const login = async (): Promise<void> => {
  const client = await getAuth0Client();
  await client.loginWithPopup({
    authorizationParams: {
      redirect_uri: chrome.identity.getRedirectURL(),
    },
  });
};

export const getToken = async (): Promise<string> => {
  const client = await getAuth0Client();
  const token = await client.getTokenSilently();
  return token;
};

export const logout = async (): Promise<void> => {
  const client = await getAuth0Client();
  await client.logout({
    logoutParams: {
      returnTo: chrome.identity.getRedirectURL(),
    },
  });
};

export const sendAuthMessage = (): Promise<{
  success: boolean;
  error?: string;
}> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "LOGIN" }, (response) => {
      resolve(response);
    });
  });
};

export const sendGetTokenMessage = (): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (response) => {
      resolve(response);
    });
  });
};

export const sendLogoutMessage = (): Promise<{
  success: boolean;
  error?: string;
}> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "LOGOUT" }, (response) => {
      resolve(response);
    });
  });
};
