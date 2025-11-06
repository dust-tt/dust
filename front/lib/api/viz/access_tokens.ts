import jwt from "jsonwebtoken";
import { z } from "zod";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import {
  fileShareScopeSchema,
  frameContentType,
  normalizeError,
} from "@app/types";

// Zod schema for VizAccessTokenPayload.
const VizAccessTokenPayloadSchema = z.object({
  contentType: z.literal(frameContentType),
  fileToken: z.string(),
  shareScope: fileShareScopeSchema,
  userId: z.string().optional(),
  workspaceId: z.string(),
});

export type VizAccessTokenPayload = z.infer<typeof VizAccessTokenPayloadSchema>;

export function generateVizAccessToken({
  fileToken,
  userId,
  shareScope,
  workspaceId,
}: {
  fileToken: string;
  userId?: string;
  shareScope: "public" | "workspace";
  workspaceId: string;
}): string {
  const payload: VizAccessTokenPayload = {
    contentType: frameContentType,
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
