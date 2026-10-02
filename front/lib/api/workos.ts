import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JWTPayload } from "jose";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const WorkOSConnectApplicationRedirectUriSchema = z.object({
  uri: z.string(),
  default: z.boolean(),
});

const WorkOSConnectApplicationBaseSchema = z.object({
  object: z.literal("connect_application"),
  id: z.string(),
  client_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  scopes: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

const WorkOSConnectOAuthApplicationSchema =
  WorkOSConnectApplicationBaseSchema.extend({
    application_type: z.literal("oauth"),
    redirect_uris: z.array(WorkOSConnectApplicationRedirectUriSchema),
    uses_pkce: z.boolean(),
    is_first_party: z.boolean(),
    was_dynamically_registered: z.boolean().optional(),
    organization_id: z.string().optional(),
  });

const WorkOSConnectM2MApplicationSchema =
  WorkOSConnectApplicationBaseSchema.extend({
    application_type: z.literal("m2m"),
    organization_id: z.string(),
  });

const WorkOSConnectApplicationSchema = z.discriminatedUnion(
  "application_type",
  [WorkOSConnectOAuthApplicationSchema, WorkOSConnectM2MApplicationSchema]
);

type WorkOSConnectApplication = z.infer<typeof WorkOSConnectApplicationSchema>;

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
  JWTPayload;

export function parseWorkOSJwtPayload(
  payload: unknown
): Result<WorkOSJwtPayload, Error> {
  const validation = WorkOSJwtPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return new Err(new Error("Invalid token payload."));
  }
  return new Ok(validation.data);
}

// Created lazily so a missing client id surfaces at verification time, not at import. The key set
// caches fetched keys across calls.
let workOSJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getWorkOSJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!workOSJwks) {
    workOSJwks = createRemoteJWKSet(
      new URL(`https://api.workos.com/sso/jwks/${config.getWorkOSClientId()}`)
    );
  }
  return workOSJwks;
}

/**
 * @cc [owner:avervaet,label:security] workos-token-verification
 * Returns Ok only for an RS256 token signed by a key from the WorkOS JWKS, issued by the WorkOS
 * issuer, unexpired, and with a valid payload shape. Any other failure, including key fetch
 * errors, is returned as Err; an expired but correctly signed token is an Err holding jose's
 * `JWTExpired`.
 */
export async function verifyWorkOSToken(
  accessToken: string
): Promise<Result<WorkOSJwtPayload, Error>> {
  const jwks = getWorkOSJwks();
  const issuer = config.getWorkOSIssuerURL();

  let decoded: JWTPayload;
  try {
    ({ payload: decoded } = await jwtVerify(accessToken, jwks, {
      algorithms: ["RS256"],
      issuer,
    }));
  } catch (err) {
    return new Err(normalizeError(err));
  }

  const payloadValidation = parseWorkOSJwtPayload(decoded);
  if (payloadValidation.isErr()) {
    logger.error("Invalid token payload.");
    return payloadValidation;
  }

  return new Ok(payloadValidation.value);
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

/**
 * Retrieve a WorkOS Connect application by application ID or client ID.
 *
 * @see https://workos.com/docs/reference/workos-connect/applications#get-a-connect-application
 */
export async function getWorkOSConnectApplication(
  clientId: string
): Promise<Result<WorkOSConnectApplication, Error>> {
  try {
    const { data } = await getWorkOS().get(
      `/connect/applications/${encodeURIComponent(clientId)}`
    );

    const validation = WorkOSConnectApplicationSchema.safeParse(data);
    if (!validation.success) {
      logger.error(
        { err: validation.error },
        "Invalid WorkOS Connect application response."
      );
      return new Err(new Error("Invalid WorkOS Connect application response."));
    }

    return new Ok(validation.data);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
