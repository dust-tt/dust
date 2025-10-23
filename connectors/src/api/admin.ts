import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import { runCommand } from "@connectors/lib/cli";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { AdminCommandType, AdminResponseType } from "@connectors/types";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import { AdminCommandSchema } from "@connectors/types";

const whitelistedCommands = [
  {
    majorCommand: "notion",
    command: "check-url",
  },
  {
    majorCommand: "notion",
    command: "find-url",
  },
  {
    majorCommand: "notion",
    command: "delete-url",
  },
  {
    majorCommand: "notion",
    command: "upsert-page",
  },
  {
    majorCommand: "notion",
    command: "upsert-database",
  },
  {
    majorCommand: "notion",
    command: "clear-parents-last-updated-at",
  },
  {
    majorCommand: "notion",
    command: "update-orphaned-resources-parents",
  },
  {
    majorCommand: "notion",
    command: "api-request",
  },
  {
    majorCommand: "slack",
    command: "whitelist-bot",
  },
  {
    majorCommand: "slack",
    command: "run-auto-join",
  },
  {
    majorCommand: "slack",
    command: "check-channel",
  },
  {
    majorCommand: "connectors",
    command: "set-error",
  },
  {
    majorCommand: "connectors",
    command: "clear-error",
  },
  {
    majorCommand: "zendesk",
    command: "fetch-ticket",
  },
  {
    majorCommand: "webcrawler",
    command: "update-frequency",
  },
  {
    majorCommand: "webcrawler",
    command: "set-actions",
  },
  {
    majorCommand: "confluence",
    command: "check-page-exists",
  },
];

const _adminAPIHandler = async (
  req: Request<Record<string, string>, AdminResponseType, AdminCommandType>,
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
        message: `Command not whitelisted: ${adminCommand.majorCommand} ${adminCommand.command}`,
      },
      status_code: 400,
    });
  }

  switch (req.method) {
    case "POST": {
      const result = await runCommand(adminCommand);
      return res.json(result);
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
