import { ManagementClient } from "auth0";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import config from "@app/lib/api/config";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

const AUTH0_DOMAIN = config.getAuth0TenantUrl();
const AUTH0_AUDIENCE = `https://${AUTH0_DOMAIN}/api/v2/`;
const AUTH0_VERIFY_TOKEN = `https://${AUTH0_DOMAIN}/.well-known/jwks.json`;
const AUTH0_ISSUER = `https://${AUTH0_DOMAIN}/`;

let auth0ManagemementClient: ManagementClient | null = null;

export function getAuth0ManagemementClient(): ManagementClient {
  if (!auth0ManagemementClient) {
    auth0ManagemementClient = new ManagementClient({
      domain: config.getAuth0TenantUrl(),
      clientId: config.getAuth0M2MClientId(),
      clientSecret: config.getAuth0M2MClientSecret(),
    });
  }

  return auth0ManagemementClient;
}

/**
 * Get the public key to verify an Auth0 token.
 * key id (kid) is used to find the right key in the JWKS.
 */
async function getSigningKey(jwksUri: string, kid: string): Promise<string> {
  const client = jwksClient({
    jwksUri,
    cache: true,
    rateLimit: true,
  });

  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      if (!key) {
        reject(new Error("Key not found"));
        return;
      }
      resolve(key.getPublicKey());
    });
  });
}

/**
 * Verify an Auth0 token.
 * Not meant to be exported, use `getUserFromAuth0Token` instead.
 */
async function verifyAuth0Token(accessToken: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      accessToken,
      async (header, callback) => {
        try {
          if (!header.kid) {
            throw new Error("No 'kid' in token header");
          }
          const signingKey = await getSigningKey(
            AUTH0_VERIFY_TOKEN,
            header.kid
          );
          callback(null, signingKey);
        } catch (err) {
          callback(err as Error);
        }
      },
      {
        algorithms: ["RS256"],
        audience: AUTH0_AUDIENCE,
        issuer: AUTH0_ISSUER,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }
        if (!decoded || typeof decoded !== "object") {
          reject(new Error("No token payload"));
          return;
        }
        resolve(decoded);
      }
    );
  });
}
/**
 * Get a user resource from an Auth0 token.
 * We return the user from its Auth0 sub, only if the token is not expired.
 */
export async function getUserFromAuth0Token(
  accessToken: string
): Promise<UserResource | null> {
  let decoded: jwt.JwtPayload;
  try {
    decoded = await verifyAuth0Token(accessToken);
  } catch (error) {
    logger.error({ error }, "Error verifying Auth0 token");
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    typeof decoded.sub !== "string" ||
    typeof decoded.exp !== "number" ||
    decoded.exp <= now
  ) {
    logger.error("Invalid or expired token payload.");
    return null;
  }

  return UserResource.fetchByAuth0Sub(decoded.sub);
}
