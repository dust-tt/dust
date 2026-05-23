import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type {
  FileShareScope,
  InteractiveContentFileContentType,
} from "@app/types/files";
import {
  fileShareScopeSchema,
  frameContentType,
  frameSlideshowContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import jwt from "jsonwebtoken";
import { z } from "zod";

// Zod schema for VizAccessTokenPayload.
const VizAccessTokenPayloadSchema = z.object({
  contentType: z.enum([frameContentType, frameSlideshowContentType]),
  fileToken: z.string(),
  shareScope: fileShareScopeSchema,
  userId: z.string().optional(),
  workspaceId: z.string(),
});

export type VizAccessTokenPayload = z.infer<typeof VizAccessTokenPayloadSchema>;

export function generateVizAccessToken({
  contentType,
  fileToken,
  userId,
  shareScope,
  workspaceId,
}: {
  contentType: InteractiveContentFileContentType;
  fileToken: string;
  userId?: string;
  shareScope: FileShareScope;
  workspaceId: string;
}): string {
  const payload: VizAccessTokenPayload = {
    contentType,
    fileToken,
    shareScope,
    userId,
    workspaceId,
  };

  const secret = config.getVizJwtSecret();

  // Sign JWT with HS256 algorithm, valid for 1 minute.
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "1m" });
}

function getRawPayloadFromToken(token: string): unknown {
  const secret = config.getVizJwtSecret();

  try {
    // Verify JWT signature.
    const rawPayload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    return rawPayload;
  } catch (error) {
    logger.error(
      {
        error: normalizeError(error),
      },
      "Failed to verify viz access token"
    );
    return null;
  }
}

export function verifyVizAccessToken(
  token: string
): VizAccessTokenPayload | null {
  const rawPayload = getRawPayloadFromToken(token);
  if (rawPayload === null) {
    return null;
  }

  // Validate payload structure with zod schema.
  const parseResult = VizAccessTokenPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    logger.error(
      {
        error: parseResult.error.flatten(),
      },
      "Invalid viz access token payload structure"
    );
    return null;
  }

  return parseResult.data;
}

const BEARER_PREFIX = "Bearer ";

/**
 * Pulls a viz access token out of an `Authorization: Bearer ...` header and verifies it. All
 * failure cases map to a `401 / workspace_auth_error` at the handler layer; only the user-facing
 * message differs, which is why the error type is a plain string rather than an HTTP envelope.
 */
export function extractAndVerifyVizAccessTokenFromHeader(
  authHeader: string | undefined
): Result<VizAccessTokenPayload, string> {
  if (!authHeader) {
    return new Err("Authorization header required.");
  }
  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return new Err("Authorization header must use Bearer token format.");
  }
  const accessToken = authHeader.substring(BEARER_PREFIX.length).trim();
  if (!accessToken) {
    return new Err("Access token is required.");
  }
  const tokenPayload = verifyVizAccessToken(accessToken);
  if (!tokenPayload) {
    return new Err("Invalid or expired access token.");
  }
  return new Ok(tokenPayload);
}
