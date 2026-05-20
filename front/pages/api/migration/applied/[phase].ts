/** @ignoreswagger */

import config from "@app/lib/api/config";
import type { AppliedMigration, MigrationPhase } from "@app/lib/api/migrations";
import { listAppliedMigrations } from "@app/lib/api/migrations";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

type GetAppliedMigrationsResponse = {
  migrations: AppliedMigration[];
};

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAppliedMigrationsResponse>>
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const authorization = req.headers["authorization"];
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "missing_authorization_header_error",
        message: "Missing or malformed Authorization header.",
      },
    });
  }

  const token = authorization.slice("Bearer ".length);
  if (!timingSafeStringEqual(token, config.getMigrationApiSecret())) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_api_key_error",
        message: "Invalid migration API secret.",
      },
    });
  }

  const { phase } = req.query;
  if (!isString(phase) || !isMigrationPhase(phase)) {
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

export default withLogging(handler);
