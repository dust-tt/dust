import type { RequestHandler } from "express";
import { error, log } from "firebase-functions/logger";
import { createRemoteJWKSet, jwtVerify } from "jose";

import type { SecretManager } from "../secrets.js";

interface BotFrameworkClaims {
  iss: string; // Issuer.
  aud: string; // Audience (bot's Microsoft App ID).
  exp: number; // Expiration time.
  nbf: number; // Not before.
  serviceurl: string;
  appid?: string;
  [key: string]: unknown;
}

// Remote JWK Set for Bot Framework.
const JWKS_URI = "https://login.botframework.com/v1/.well-known/keys";
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

const TIMEOUT_DURATION_MS = 10000; // 10 seconds.
const COOLDOWN_DURATION_MS = 30000; // 30 seconds.

function getJWKS() {
  if (!jwksCache) {
    log("Initializing Bot Framework JWKS", { jwksUri: JWKS_URI });
    jwksCache = createRemoteJWKSet(new URL(JWKS_URI), {
      timeoutDuration: TIMEOUT_DURATION_MS,
      cooldownDuration: COOLDOWN_DURATION_MS,
    });
  }

  return jwksCache;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function validateBotFrameworkToken(
  token: string,
  expectedAppId: string
): Promise<BotFrameworkClaims | null> {
  try {
    // Remove "Bearer " prefix if present.
    const cleanToken = token.replace(/^Bearer\s+/i, "");

    // Get JWKS for signature verification.
    const JWKS = getJWKS();

    // Verify and decode the JWT using jose.
    const { payload } = await jwtVerify(cleanToken, JWKS, {
      issuer: "https://api.botframework.com",
      audience: expectedAppId,
      clockTolerance: "5 minutes",
    });

    const verifiedPayload = payload as BotFrameworkClaims;

    log("Successfully validated Bot Framework JWT token", {
      appId: verifiedPayload.aud,
      serviceUrl: verifiedPayload.serviceurl,
      exp: verifiedPayload.exp,
    });

    return verifiedPayload;
  } catch (e) {
    error("Bot Framework token validation failed:", e);
    return null;
  }
}

function validateServiceUrl(serviceUrl: string): boolean {
  const validOrigins = [
    "https://smba.trafficmanager.net",
    "https://eus.smba.trafficmanager.net",
    "https://wus.smba.trafficmanager.net",
    "https://emea.smba.trafficmanager.net",
    "https://apac.smba.trafficmanager.net",
  ];

  return validOrigins.some((origin) => serviceUrl.startsWith(origin));
}

// Creates middleware that verifies Bot Framework JWT token for Teams webhooks.
export function createTeamsVerificationMiddleware(
  secretManager: SecretManager
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      // Get secrets for Bot Framework validation (webhook secret already validated)
      const secrets = await secretManager.getSecrets();

      // Extract Bearer token.
      const authHeader = req.headers.authorization;
      const token = extractBearerToken(authHeader);

      if (!token) {
        error("Missing or invalid Authorization header in Teams webhook", {
          component: "teams-verification",
        });
        res.status(401).send("Unauthorized");
        return;
      }

      // Get Microsoft Bot ID for Bot Framework validation.
      if (!secrets.microsoftBotId) {
        error("Microsoft Bot ID not configured", {
          component: "teams-verification",
        });
        res.status(500).send("Bot configuration error");
        return;
      }

      // Validate JWT token.
      const claims = await validateBotFrameworkToken(
        token,
        secrets.microsoftBotId
      );
      if (!claims) {
        error("Invalid Bot Framework JWT token", {
          component: "teams-verification",
        });
        res.status(403).send("Forbidden");
        return;
      }

      // Validate service URL.
      if (!validateServiceUrl(claims.serviceurl)) {
        error("Invalid service URL in Teams webhook", {
          component: "teams-verification",
          serviceUrl: claims.serviceurl,
        });
        res.status(403).send("Forbidden");
        return;
      }

      log("Teams webhook validation passed", {
        component: "teams-verification",
        appId: claims.aud,
        serviceUrl: claims.serviceurl,
      });

      next();
    } catch (e) {
      error("Teams request verification failed", {
        component: "teams-verification",
        error: e instanceof Error ? e.message : String(e),
      });

      res.status(500).send("Internal server error");
      return;
    }
  };
}
