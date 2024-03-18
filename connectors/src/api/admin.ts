import {
  AdminCommandSchema,
  type AdminCommandType,
  type AdminResponseType,
  type WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import type { Request, Response } from "express";

import { RESUME_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

const whitelistedCommands = [
  {
    majorCommand: "connectors",
    command: "resume",
  },
];

const _adminAPIHandler = async (
  req: Request<any, AdminResponseType, AdminCommandType>,
  res: Response<WithConnectorsAPIErrorReponse<AdminResponseType>>
) => {
  const adminCommandValidation = AdminCommandSchema.decode(req.body);

  if (isLeft(adminCommandValidation)) {
    const pathError = reporter.formatValidationErrors(
      adminCommandValidation.left
    );
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  const adminCommand = adminCommandValidation.right;

  if (
    !whitelistedCommands.some(
      (cmd) =>
        cmd.majorCommand === adminCommand.majorCommand &&
        cmd.command === adminCommand.command
    )
  ) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Command not whitelisted: ${JSON.stringify(adminCommand)}`,
      },
      status_code: 400,
    });
  }

  switch (req.method) {
    case "POST": {
    }
    default: {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: `Invalid request method: ${req.method}`,
        },
        status_code: 400,
      });
    }
  }
};

export const adminAPIHandler = withLogging(_adminAPIHandler);
