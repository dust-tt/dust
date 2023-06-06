import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

import logger from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

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
    res.status(401).send({
      error: {
        message: "Missing Authorization header",
      },
    });
    return;
  }
  const authorization = req.headers["authorization"];
  if (typeof authorization !== "string") {
    return res.status(401).send({
      error: { message: "Invalid Authorization header. Should be a string" },
    });
  }

  if (authorization.split(" ")[0] !== "Bearer") {
    return res
      .status(401)
      .send({ error: { message: "Invalid Authorization header" } });
  }
  const secret = authorization.split(" ")[1];
  if (!secret) {
    return res.status(401).send({ error: { message: "Missing API key" } });
  }
  if (secret !== DUST_CONNECTORS_SECRET) {
    return res.status(401).send({ error: { message: "Invalid API key" } });
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
      return res.status(401).send({
        error: {
          message: "Invalid webhook secret",
        },
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
      api_error: {
        type: "internal_server_error",
        message: "Internal server error.",
      },
      status_code: 500,
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
        type: "not_found",
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
