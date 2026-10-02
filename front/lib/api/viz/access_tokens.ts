import config from "@app/lib/api/config";
import { signHS256Jwt, verifyHS256Jwt } from "@app/lib/utils/hs256_jwt";
import logger from "@app/logger/logger";
import type { FileShareScope, FrameFileContentType } from "@app/types/files";
import {
  fileShareScopeSchema,
  frameContentType,
  frameSlideshowContentType,
  frameV2ContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

// Zod schema for VizAccessTokenPayload.
const VizAccessTokenPayloadSchema = z.object({
  contentType: z.enum([
    frameContentType,
    frameSlideshowContentType,
    frameV2ContentType,
  ]),
  fileToken: z.string(),
  shareScope: fileShareScopeSchema,
  userId: z.string().optional(),
  workspaceId: z.string(),
});

type VizAccessTokenPayload = z.infer<typeof VizAccessTokenPayloadSchema>;

export async function generateVizAccessToken({
  contentType,
  fileToken,
  userId,
  shareScope,
  workspaceId,
}: {
  contentType: FrameFileContentType;
  fileToken: string;
  userId?: string;
  shareScope: FileShareScope;
  workspaceId: string;
}): Promise<string> {
  const payload: VizAccessTokenPayload = {
    contentType,
    fileToken,
    shareScope,
    userId,
    workspaceId,
  };

  // Valid for 1 minute.
  return signHS256Jwt(payload, config.getVizJwtSecret(), {
    expiresInSeconds: 60,
  });
}

async function getRawPayloadFromToken(token: string): Promise<unknown> {
  try {
    return await verifyHS256Jwt(token, config.getVizJwtSecret());
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

async function verifyVizAccessToken(
  token: string
): Promise<VizAccessTokenPayload | null> {
  const rawPayload = await getRawPayloadFromToken(token);
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
export async function extractAndVerifyVizAccessTokenFromHeader(
  authHeader: string | undefined
): Promise<Result<VizAccessTokenPayload, string>> {
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
  const tokenPayload = await verifyVizAccessToken(accessToken);
  if (!tokenPayload) {
    return new Err("Invalid or expired access token.");
  }
  return new Ok(tokenPayload);
}
