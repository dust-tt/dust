import config from "@app/lib/api/config";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { z } from "zod";

const WorkOSJwtClaimValueSchema = z.union([
  z.string(),
  z.number(),
  z.undefined(),
  z.array(z.string()),
]);

export const WorkOSJwtPayloadSchema = z
  .object({
    exp: z.number(),
    sub: z.string(),
  })
  .catchall(WorkOSJwtClaimValueSchema);

export type WorkOSJwtPayload = z.infer<typeof WorkOSJwtPayloadSchema> &
  jwt.JwtPayload;

export function parseWorkOSJwtPayload(
  payload: unknown
): Result<WorkOSJwtPayload, Error> {
  const validation = WorkOSJwtPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return new Err(new Error("Invalid token payload."));
  }
  return new Ok(validation.data);
}

/**
 * Get the public key to verify a WorkOS token.
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
 * Verify a WorkOS token.
 */
export async function verifyWorkOSToken(
  accessToken: string
): Promise<Result<WorkOSJwtPayload, Error>> {
  const verify = `https://api.workos.com/sso/jwks/${config.getWorkOSClientId()}`;
  const issuer = config.getWorkOSIssuerURL();

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
          callback(normalizeError(err));
        }
      },
      {
        algorithms: ["RS256"],
        issuer: issuer,
      },
      (err, decoded) => {
        if (err) {
          return resolve(new Err(err));
        }
        if (!decoded || typeof decoded !== "object") {
          return resolve(new Err(Error("No token payload")));
        }

        const payloadValidation = parseWorkOSJwtPayload(decoded);
        if (payloadValidation.isErr()) {
          logger.error("Invalid token payload.");
          return resolve(payloadValidation);
        }

        return resolve(new Ok(payloadValidation.value));
      }
    );
  });
}

/**
 * Get a user resource from a WorkOS token.
 * We return the user from the accessToken sub.
 */
export async function getUserFromWorkOSToken(
  accessToken: WorkOSJwtPayload
): Promise<UserResource | null> {
  return UserResource.fetchByWorkOSUserId(accessToken.sub);
}
