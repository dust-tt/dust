import type { Session } from "@auth0/nextjs-auth0";
import { ManagementClient } from "auth0";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { NextApiRequest } from "next";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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

export const Auth0JwtPayloadSchema = t.intersection([
  t.type({
    azp: t.string,
    exp: t.number,
    scope: t.string,
    sub: t.string,
  }),
  t.record(
    t.string,
    t.union([t.string, t.number, t.undefined, t.array(t.string)])
  ),
]);

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

// Store the region in the user's app_metadata to redirect to the right region.
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
  const regionClaim = `${config.getAuth0NamespaceClaim()}region`;

  return session.user[regionClaim] ?? null;
}

export function getRegionForJwtToken(
  token: Auth0JwtPayload
): RegionType | null {
  const regionClaim = `${config.getAuth0NamespaceClaim()}region`;

  return token[regionClaim] ?? null;
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

  const useLegacy =
    !decoded ||
    (Array.isArray(decoded.aud)
      ? !decoded.aud.includes(audience)
      : decoded.aud !== audience);

  logger.info({ useLegacy, audience: decoded?.aud }, "Get Auth0 token");

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

        const region = getRegionForJwtToken(payloadValidation.right);
        if (region && regionsConfig.getCurrentRegion() !== region) {
          logger.info(
            { region, requiredRegion: regionsConfig.getCurrentRegion() },
            "Invalid region."
          );
          return resolve(new Err(Error("Invalid region.")));
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

export async function getAuth0UsersFromEmail(emails: string[]) {
  const emailQueries = emails.map(
    (email) => `email:"${email.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1")}"`
  );

  // URL length limit is 2048 characters, keep some margin for base URL and encoded characters.
  const chunkSize = 1900;
  const emailRequestChunks: string[] = [];
  let currentChunk = "";

  for (const query of emailQueries) {
    const separator = currentChunk ? " OR " : "";
    if ((currentChunk + separator + query).length > chunkSize) {
      emailRequestChunks.push(currentChunk);
      currentChunk = query;
    } else {
      currentChunk = currentChunk + separator + query;
    }
  }
  if (currentChunk) {
    emailRequestChunks.push(currentChunk);
  }

  const auth0Users = [];
  for (const chunk of emailRequestChunks) {
    const res = await getAuth0ManagemementClient().users.getAll({
      q: chunk,
    });
    if (res.data) {
      auth0Users.push(...res.data);
    }
  }

  return auth0Users;
}
