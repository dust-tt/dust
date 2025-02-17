import crypto from "crypto";
import express, { Request, Response } from "express";
import open from "open";
import { loadTokens, removeTokens, saveTokens, TokenData } from "./config.js";

const AUTH0_DOMAIN = "dust-dev.eu.auth0.com";
const AUTH0_CLIENT_ID = "XktEiKkdrADjGID13OXc5sDAaxa2WUJG";
const REDIRECT_URI = "http://localhost:3333/callback";
const DUST_API_AUDIENCE = "https://dust-dev.tt/api/v1";

interface Auth0AuthorizeResponse {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
  token_type: string;
}

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

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<Auth0AuthorizeResponse> {
  const tokenEndpoint = `https://${AUTH0_DOMAIN}/oauth/token`;
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: AUTH0_CLIENT_ID,
      code_verifier: codeVerifier,
      code: code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to exchange code for tokens: ${JSON.stringify(error)}`
    );
  }

  return response.json();
}

export async function login(): Promise<TokenData> {
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

        const authResponse = await exchangeCodeForTokens(
          code as string,
          codeVerifier
        );

        const tokens: TokenData = {
          accessToken: authResponse.access_token,
          refreshToken: authResponse.refresh_token,
          expiresAt: Date.now() + authResponse.expires_in * 1000,
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

export async function logout(): Promise<void> {
  await removeTokens();
}

export async function isLoggedIn(): Promise<boolean> {
  const tokens = await loadTokens();
  if (!tokens) {
    return false;
  }

  // Check if token is expired (with 5 minute buffer)
  const now = Date.now();
  return tokens.expiresAt > now + 5 * 60 * 1000;
}
