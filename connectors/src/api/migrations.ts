import { apiConfig } from "@connectors/lib/api/config";
import type { MigrationPhase } from "@connectors/lib/api/migrations";
import { listAppliedMigrations } from "@connectors/lib/api/migrations";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import crypto from "crypto";
import type { Request, Response } from "express";

const VALID_PHASES: MigrationPhase[] = ["pre-deploy", "post-deploy"];

function isMigrationPhase(value: string): value is MigrationPhase {
  return (VALID_PHASES as string[]).includes(value);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export const getAppliedMigrationsHandler = withLogging(
  async (req: Request, res: Response) => {
    const authorization = req.headers["authorization"];
    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      return apiError(req, res, {
        status_code: 401,
        api_error: {
          type: "authorization_error",
          message: "Missing or malformed Authorization header.",
        },
      });
    }

    const token = authorization.slice("Bearer ".length);
    if (!timingSafeStringEqual(token, apiConfig.getMigrationApiSecret())) {
      return apiError(req, res, {
        status_code: 401,
        api_error: {
          type: "authorization_error",
          message: "Invalid migration API secret.",
        },
      });
    }

    const { phase } = req.params;
    if (!phase || !isMigrationPhase(phase)) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: `Phase must be one of: ${VALID_PHASES.join(", ")}.`,
        },
      });
    }

    const migrations = await listAppliedMigrations(phase);
    res.status(200).json({ migrations });
  }
);
