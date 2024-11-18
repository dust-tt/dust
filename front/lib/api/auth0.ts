import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { ManagementClient } from "auth0";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { NextApiRequest } from "next";

import config from "@app/lib/api/config";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

let auth0ManagemementClient: ManagementClient | null = null;

export interface Auth0JwtPayload extends jwt.JwtPayload {
  azp: string;
  exp: number;
  scope: string;
  sub: string;
}

const METHOD_TO_VERB: Record<string, string> = {
  GET: "read",
  POST: "create",
  PATCH: "update",
  DELETE: "delete",
};

export function getRequiredScope(
  req: NextApiRequest,
  {
    resourceName,
  }: {
    resourceName?: string;
  }
) {
  if (resourceName && req.method) {
    return [`${METHOD_TO_VERB[req.method]}:${resourceName}`];
  }
  return undefined;
}

function isAuth0Payload(payload: jwt.JwtPayload): payload is Auth0JwtPayload {
  return (
    "azp" in payload &&
    typeof payload.azp === "string" &&
    "exp" in payload &&
    typeof payload.exp === "number" &&
    "scope" in payload &&
    typeof payload.scope === "string" &&
    "sub" in payload &&
    typeof payload.sub === "string"
  );
}

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
export async function verifyAuth0Token(
  accessToken: string,
  requiredScopes?: string[]
): Promise<Result<Auth0JwtPayload, Error>> {
  const auth0Domain = config.getAuth0TenantUrl();
  const audience = config.getDustApiAudience();
  const verify = `https://${auth0Domain}/.well-known/jwks.json`;
  const issuer = `https://${auth0Domain}/`;

  return new Promise((resolve) => {
    jwt.verify(
      accessToken,
      async (header, callback) => {
        try {
          if (!header.kid) {
            throw new Error("No 'kid' in token header");
          }
          const signingKey = await getSigningKey(verify, header.kid);
          callback(null, signingKey);
        } catch (err) {
          callback(err as Error);
        }
      },
      {
        algorithms: ["RS256"],
        audience: audience,
        issuer: issuer,
      },
      (err, decoded) => {
        if (err) {
          return resolve(new Err(err));
        }
        if (!decoded || typeof decoded !== "object") {
          return resolve(new Err(Error("No token payload")));
        }

        if (!isAuth0Payload(decoded)) {
          logger.error("Invalid token payload.");
          return resolve(new Err(Error("Invalid token payload.")));
        }

        const now = Math.floor(Date.now() / 1000);

        if (decoded.exp <= now) {
          logger.error("Expired token payload.");
          return resolve(new Err(Error("Expired token payload.")));
        }

        if (requiredScopes) {
          const availableScopes = decoded.scope.split(" ");
          if (
            requiredScopes.some((scope) => !availableScopes.includes(scope))
          ) {
            logger.error("Insufficient scopes.");
            return resolve(new Err(Error("Insufficient scopes.")));
          }
        }

        resolve(new Ok(decoded));
      }
    );
  });
}

/**
 * Get a user resource from an Auth0 token.
 * We return the user from its Auth0 sub, only if the token is not expired.
 */
export async function getUserFromAuth0Token(
  accessToken: Auth0JwtPayload
): Promise<UserResource | null> {
  return UserResource.fetchByAuth0Sub(accessToken.sub);
}
