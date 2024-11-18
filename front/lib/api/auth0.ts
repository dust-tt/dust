import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { ManagementClient } from "auth0";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { NextApiRequest } from "next";

import config from "@app/lib/api/config";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

let auth0ManagemementClient: ManagementClient | null = null;

const Auth0JwtPayloadSchema = t.type({
  azp: t.string,
  exp: t.number,
  scope: t.string,
  sub: t.string,
});

type Auth0JwtPayload = t.TypeOf<typeof Auth0JwtPayloadSchema> & jwt.JwtPayload;

export function getRequiredScope(
  req: NextApiRequest,
  requiredScopes?: Record<string, string>
) {
  if (requiredScopes && req.method && requiredScopes[req.method]) {
    return [requiredScopes[req.method]];
  }
  return undefined;
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

        const payloadValidation = Auth0JwtPayloadSchema.decode(decoded);
        if (isLeft(payloadValidation)) {
          logger.error("Invalid token payload.");
          return resolve(new Err(Error("Invalid token payload.")));
        }

        if (requiredScopes) {
          const availableScopes = decoded.scope.split(" ");
          if (
            requiredScopes.some((scope) => !availableScopes.includes(scope))
          ) {
            logger.error({ requiredScopes }, "Insufficient scopes.");
            return resolve(new Err(Error("Insufficient scopes.")));
          }
        }

        return resolve(new Ok(payloadValidation.right));
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
