import { buildAdminProgram } from "@connectors/admin/cli_program";
import { buildCliCommandCatalog } from "@connectors/lib/admin/catalog";
import { runCommand } from "@connectors/lib/cli";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type {
  AdminCommandType,
  AdminResponseType,
  CliCommandCatalog,
  WithConnectorsAPIErrorReponse,
} from "@connectors/types";
import { AdminCommandSchema } from "@connectors/types";
import type { Request, Response } from "express";
import { fromError } from "zod-validation-error";

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
    command: "skip-channel",
  },
  {
    majorCommand: "slack",
    command: "unskip-channel",
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
    majorCommand: "slack",
    command: "delete-conversation",
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
  {
    majorCommand: "google_drive",
    command: "upsert-file",
  },
  {
    majorCommand: "intercom",
    command: "get-conversations-sliding-window",
  },
  {
    majorCommand: "intercom",
    command: "set-conversations-sliding-window",
  },
];

const _adminAPIHandler = async (
  req: Request<Record<string, string>, AdminResponseType, AdminCommandType>,
  res: Response<WithConnectorsAPIErrorReponse<AdminResponseType>>
) => {
  const adminCommandValidation = AdminCommandSchema.safeParse(req.body);

  if (!adminCommandValidation.success) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(adminCommandValidation.error).toString()}`,
      },
      status_code: 400,
    });
  }

  const adminCommand = adminCommandValidation.data;

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

const _adminCatalogAPIHandler = async (
  _req: Request,
  res: Response<WithConnectorsAPIErrorReponse<CliCommandCatalog>>
) => {
  // Building the program is cheap (no argv parsing, no connector code loaded).
  const catalog = buildCliCommandCatalog(buildAdminProgram());
  return res.json(catalog);
};

export const adminCatalogAPIHandler = withLogging(_adminCatalogAPIHandler);

// Runs any command that validates against AdminCommandSchema, WITHOUT the
// interactive whitelist. Used by the Poke "Run Connector CLI Command" plugin,
// which is gated at the front layer by super-user + engineering role. The
// whitelisted `adminAPIHandler` above stays the entry point for other callers.
const _adminRunAPIHandler = async (
  req: Request<Record<string, string>, AdminResponseType, AdminCommandType>,
  res: Response<WithConnectorsAPIErrorReponse<AdminResponseType>>
) => {
  const adminCommandValidation = AdminCommandSchema.safeParse(req.body);
  if (!adminCommandValidation.success) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(adminCommandValidation.error).toString()}`,
      },
      status_code: 400,
    });
  }

  const result = await runCommand(adminCommandValidation.data);
  return res.json(result);
};

export const adminRunAPIHandler = withLogging(_adminRunAPIHandler);
