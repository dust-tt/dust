import type { Session } from "@auth0/nextjs-auth0";
import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { ManagementClient } from "auth0";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { NextApiRequest } from "next";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

let auth0ManagemementClient: ManagementClient | null = null;

export const SUPPORTED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type MethodType = (typeof SUPPORTED_METHODS)[number];

const isSupportedMethod = (method: string): method is MethodType =>
  SUPPORTED_METHODS.includes(method as MethodType);

export type ScopeType =
  | "read:user_profile"
  | "read:conversation"
  | "update:conversation"
  | "create:conversation"
  | "read:file"
  | "update:file"
  | "create:file"
  | "delete:file"
  | "read:agent";

export const Auth0JwtPayloadSchema = t.type({
  azp: t.string,
  exp: t.number,
  scope: t.string,
  sub: t.string,
});

export type Auth0JwtPayload = t.TypeOf<typeof Auth0JwtPayloadSchema> &
  jwt.JwtPayload;

export function getRequiredScope(
  req: NextApiRequest,
  requiredScopes?: Partial<Record<MethodType, ScopeType>>
) {
  const method = req.method;

  if (
    method &&
    isSupportedMethod(method) &&
    requiredScopes &&
    requiredScopes[method]
  ) {
    return requiredScopes[method];
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

export async function setRegionForUser(session: Session, region: RegionType) {
  const managementClient = getAuth0ManagemementClient();

  return managementClient.users.update(
    {
      id: session.user.sub,
    },
    {
      app_metadata: {
        region,
      },
    }
  );
}

export function getRegionForUserSession(session: Session): RegionType | null {
  return session.user.app_metadata?.region ?? null;
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
  requiredScope?: ScopeType
): Promise<Result<Auth0JwtPayload, Error>> {
  const auth0Domain = config.getAuth0TenantUrl();
  const audience = config.getDustApiAudience();
  const verify = `https://${auth0Domain}/.well-known/jwks.json`;
  const issuer = `https://${auth0Domain}/`;

  // TODO(thomas): Remove this when all clients are updated.
  const legacyAudience = `https://${auth0Domain}/api/v2/`;
  const decoded = jwt.decode(accessToken, { json: true });
  const useLegacy = !decoded || decoded.aud !== audience;

  logger.info({ useLegacy, audience: decoded?.aud }, "Using legacy audience.");

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
        audience: useLegacy ? legacyAudience : audience,
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

        if (requiredScope && !useLegacy) {
          const availableScopes = decoded.scope.split(" ");
          if (!availableScopes.includes(requiredScope)) {
            logger.error(
              { requiredScopes: requiredScope },
              "Insufficient scopes."
            );
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
