import type { ConnectorsAPIErrorResponse } from "@dust-tt/types";
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";

import logger from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";

const {
  DUST_CONNECTORS_SECRET,
  DUST_CONNECTORS_WEBHOOKS_SECRET,
  GITHUB_WEBHOOK_SECRET,
} = process.env;

if (!DUST_CONNECTORS_SECRET) {
  throw new Error("DUST_CONNECTORS_SECRET is not defined");
}
if (!DUST_CONNECTORS_WEBHOOKS_SECRET) {
  throw new Error("DUST_CONNECTORS_WEBHOOKS_SECRET is not defined");
}

export const authMiddleware = (
  req: Request,
  res: Response<ConnectorsAPIErrorResponse>,
  next: NextFunction
) => {
  if (req.path.startsWith("/webhooks")) {
    if (req.path.endsWith("/github")) {
      return _authMiddlewareWebhooksGithub(req, res, next);
    }
    return _authMiddlewareWebhooks(req, res, next);
  }

  return _authMiddlewareAPI(req, res, next);
};

const _authMiddlewareAPI = (
  req: Request,
  res: Response<ConnectorsAPIErrorResponse>,
  next: NextFunction
) => {
  if (!req.headers["authorization"]) {
    return apiError(req, res, {
      api_error: {
        type: "authorization_error",
        message: "Missing Authorization header",
      },
      status_code: 401,
    });
  }
  const authorization = req.headers["authorization"];
  if (typeof authorization !== "string") {
    return apiError(req, res, {
      api_error: {
        type: "authorization_error",
        message: "Invalid Authorization header. Should be a string",
      },
      status_code: 401,
    });
  }

  if (authorization.split(" ")[0] !== "Bearer") {
    return apiError(req, res, {
      api_error: {
        type: "authorization_error",
        message: "Invalid Authorization header",
      },
      status_code: 401,
    });
  }
  const secret = authorization.split(" ")[1];
  if (!secret) {
    return apiError(req, res, {
      api_error: {
        type: "authorization_error",
        message: "Missing API key",
      },
      status_code: 401,
    });
  }
  if (secret !== DUST_CONNECTORS_SECRET) {
    return apiError(req, res, {
      api_error: {
        type: "authorization_error",
        message: "Invalid API key",
      },
      status_code: 401,
    });
  }
  next();
};

const _authMiddlewareWebhooks = (
  req: Request,
  res: Response<ConnectorsAPIErrorResponse>,
  next: NextFunction
) => {
  if (req.path.startsWith("/webhooks")) {
    const parts = req.path.split("/");

    if (parts.includes(DUST_CONNECTORS_WEBHOOKS_SECRET) === false) {
      return apiError(req, res, {
        api_error: {
          type: "authorization_error",
          message: "Invalid webhook secret",
        },
        status_code: 401,
      });
    }
  }
  next();
};

const _authMiddlewareWebhooksGithub = (
  req: Request,
  res: Response<ConnectorsAPIErrorResponse>,
  next: NextFunction
) => {
  if (!req.path.split("/").includes(DUST_CONNECTORS_WEBHOOKS_SECRET)) {
    logger.error({ path: req.path }, `Invalid webhook secret`);
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: "Not found.",
      },
      status_code: 404,
    });
  }

  if (!GITHUB_WEBHOOK_SECRET) {
    logger.error("GITHUB_WEBHOOK_SECRET is not defined");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Webhook secret is not defined.",
      },
    });
  }

  // check webhook signature
  // @ts-expect-error -- rawBody is not defined on Request
  // but it is added by a previous middleware
  const body = req.rawBody as Buffer;

  if (!req.headers["x-hub-signature-256"]) {
    logger.error("x-hub-signature-256 header is missing.");
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: "Not found.",
      },
      status_code: 404,
    });
  }

  const signatureHeader = req.headers["x-hub-signature-256"];
  const computedSignature = `sha256=${crypto
    .createHmac("sha256", GITHUB_WEBHOOK_SECRET)
    .update(body)
    .digest("hex")}`;

  if (Array.isArray(signatureHeader)) {
    logger.error(
      { signatureHeader },
      `Unexpected x-hub-signature-256 header format`
    );
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Not found.",
      },
      status_code: 404,
    });
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(computedSignature)
    )
  ) {
    logger.error(
      { signatureHeader, computedSignature },
      `x-hub-signature-256 header does not match computed signature`
    );
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: "Not found.",
      },
      status_code: 404,
    });
  }

  next();
};
