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
 * Verify an Auth0 token.
 * Not meant to be exported, use `getUserFromAuth0Token` instead.
 */
export function verifyAuth0Token(idToken: string): Promise<jwt.JwtPayload> {
  const client = jwksClient({
    jwksUri: AUTH0_VERIFY_TOKEN,
    cache: true,
    rateLimit: true,
  });

  function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
    client.getSigningKey(header.kid!, (err, key) => {
      if (err) {
        callback(err);
        return;
      }
      if (!key) {
        callback(new Error("Key not found"));
        return;
      }
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    });
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ["RS256"],
        audience: AUTH0_AUDIENCE,
        issuer: AUTH0_ISSUER,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else if (!decoded || typeof decoded !== "object") {
          reject(new Error("No token payload"));
        } else {
          resolve(decoded);
        }
      }
    );
  });
}

/**
 * Get a user resource from an Auth0 token.
 * We return the user from its Auth0 sub, only if the token is not expired.
 */
export async function getUserFromAuth0Token(
  idToken: string
): Promise<UserResource | null> {
  let decoded: jwt.JwtPayload;
  try {
    decoded = await verifyAuth0Token(idToken);
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
