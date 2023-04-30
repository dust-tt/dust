import { NextFunction, Request, Response } from "express";

import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

const { DUST_CONNECTORS_SECRET, DUST_CONNECTORS_WEBHOOKS_SECRET } = process.env;

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
