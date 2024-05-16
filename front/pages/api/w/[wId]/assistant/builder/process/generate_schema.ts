import type {
  ProcessSchemaPropertyType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { cloneBaseConfig } from "@dust-tt/types";
import { InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema } from "@dust-tt/types";
import { DustProdActionRegistry } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<{
      schema: ProcessSchemaPropertyType[];
    }>
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Workspace not found or user not authenticated to this workspace.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation =
        InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema.decode(
          req.body
        );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const config = cloneBaseConfig(
        DustProdActionRegistry[
          "assistant-builder-process-action-schema-generator"
        ].config
      );

      const actionRes = await runAction(
        auth,
        "assistant-builder-process-action-schema-generator",
        config,
        [
          {
            instructions: bodyValidation.right.instructions,
          },
        ]
      );

      if (actionRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error generating schema: ${JSON.stringify(
              actionRes.error
            )}`,
          },
        });
      }

      if (
        !actionRes.value.results ||
        !actionRes.value.results[0] ||
        !actionRes.value.results[0][0] ||
        !actionRes.value.results[0][0].value
      ) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error generating schema: no result returned by model.`,
          },
        });
      }

      const schema = actionRes.value.results[0][0].value as unknown;
      console.log(schema);

      return res.status(200).json({ schema: [] });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
