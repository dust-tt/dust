import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

import logger from "@connectors/logger/logger";

export interface BotFrameworkClaims {
  iss: string; // issuer
  aud: string; // audience (bot's Microsoft App ID)
  exp: number; // expiration time
  nbf: number; // not before
  serviceurl: string;
  appid?: string;
  [key: string]: unknown;
}

// Remote JWK Set for Bot Framework
const JWKS_URI = "https://login.botframework.com/v1/.well-known/keys";
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwksCache) {
    logger.info({ jwksUri: JWKS_URI }, "Initializing Bot Framework JWKS");
    jwksCache = createRemoteJWKSet(new URL(JWKS_URI), {
      timeoutDuration: 10000, // 10 second timeout
      cooldownDuration: 30000, // 30 second cooldown between fetches
    });
  }
  return jwksCache;
}

/**
 * Validates a Bot Framework JWT token according to Microsoft specifications
 */
export async function validateBotFrameworkToken(
  token: string,
  expectedAppId: string,
  expectedServiceUrl?: string
): Promise<BotFrameworkClaims | null> {
  try {
    // Remove "Bearer " prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, "");

    // Get JWKS for signature verification
    const JWKS = getJWKS();

    // Verify and decode the JWT using jose
    const { payload } = await jwtVerify(cleanToken, JWKS, {
      issuer: "https://api.botframework.com",
      audience: expectedAppId,
      clockTolerance: "5 minutes", // Industry standard clock skew
    });

    const verifiedPayload = payload as BotFrameworkClaims;

    // Additional validation as per Microsoft documentation

    // Validate service URL if provided
    if (
      expectedServiceUrl &&
      verifiedPayload.serviceurl !== expectedServiceUrl
    ) {
      logger.warn(
        {
          expectedServiceUrl,
          actualServiceUrl: verifiedPayload.serviceurl,
        },
        "Invalid JWT serviceUrl claim"
      );
      return null;
    }

    logger.info(
      {
        appId: verifiedPayload.aud,
        serviceUrl: verifiedPayload.serviceurl,
        exp: verifiedPayload.exp,
      },
      "Successfully validated Bot Framework JWT token"
    );

    return verifiedPayload;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("JSON Web Key Set")) {
        logger.error(
          {
            error: error.message,
            jwksUri: JWKS_URI,
          },
          "Failed to fetch Bot Framework JWKS"
        );
      } else if (error.message.includes("JWS")) {
        logger.error(
          {
            error: error.message,
          },
          "JWT signature verification failed"
        );
      } else {
        logger.error(
          {
            error: error.message,
          },
          "JWT token validation failed"
        );
      }
    } else {
      logger.error(
        { error },
        "Unknown error validating Bot Framework JWT token"
      );
    }
    return null;
  }
}

/**
 * Validates the Authorization header contains a properly formatted Bearer token
 */
export function extractBearerToken(
  authHeader: string | undefined
): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}
