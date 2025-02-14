// This is a temporary implementation of authentication.
// It uses the Auth0 OAuth 2.0 flow with PKCE.

// NOTE: Current implementation of auth0 is expecting a client secret.
// It is fixed by commenting out the following code in `x/kyllian/dust-mcp/node_modules/auth0/dist/esm/auth/client-authentication.js`:
// ```
// if ((!payload.client_secret || payload.client_secret.trim().length === 0) &&
//     (!payload.client_assertion || payload.client_assertion.trim().length === 0) &&
//     !useMTLS) {
//     throw new Error('The client_secret or client_assertion field is required, or it should be mTLS request.');
// }
// ```

// TODO(kyllian): Replace with a custom implementation of PKCE.

import { AuthenticationClient } from "auth0";
import crypto from "crypto";
import express, { Request, Response } from "express";
import open from "open";
import { saveTokens, TokenData } from "./config.js";

const AUTH0_DOMAIN = "dust-dev.eu.auth0.com";
const AUTH0_CLIENT_ID = "XktEiKkdrADjGID13OXc5sDAaxa2WUJG";
const REDIRECT_URI = "http://localhost:3333/callback";
const DUST_API_AUDIENCE = "https://dust-dev.tt/api/v1";

const base64URLEncode = (buffer: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
};

const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(digest);
};

export const generatePKCE = async (): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
};

export async function authenticate(): Promise<TokenData> {
  return new Promise(async (resolve, reject) => {
    const app = express();
    let server = app.listen(3333);

    const { codeVerifier, codeChallenge } = await generatePKCE();

    const options = {
      client_id: AUTH0_CLIENT_ID,
      response_type: "code",
      scope:
        "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file",
      redirect_uri: REDIRECT_URI,
      audience: DUST_API_AUDIENCE,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    };

    const queryString = new URLSearchParams(options).toString();
    const authUrl = `https://${AUTH0_DOMAIN}/authorize?${queryString}`;

    app.get("/callback", async (req: Request, res: Response) => {
      try {
        const { code } = req.query;

        if (!code) {
          throw new Error("No code received from Auth0");
        }

        const auth0 = new AuthenticationClient({
          domain: AUTH0_DOMAIN,
          clientId: AUTH0_CLIENT_ID,
        });

        const tokenSet = await auth0.oauth.authorizationCodeGrantWithPKCE({
          code: code as string,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        });

        const tokens: TokenData = {
          accessToken: tokenSet.data.access_token,
          refreshToken: tokenSet.data.refresh_token,
          expiresAt: Date.now() + tokenSet.data.expires_in * 1000,
        };

        await saveTokens(tokens);

        res.send("Authentication successful! You can close this window.");
        server.close();
        resolve(tokens);
      } catch (error) {
        console.error("Authentication error:", error);
        res.status(500).send("Authentication failed!");
        server.close();
        reject(error);
      }
    });

    open(authUrl);
  });
}
