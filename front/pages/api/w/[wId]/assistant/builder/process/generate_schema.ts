import type { JSONSchema7 } from "json-schema";
import type { NextApiRequest, NextApiResponse } from "next";

import { getBuilderJsonSchemaGenerator } from "@app/lib/api/assistant/json_schema_generator";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  InternalPostBuilderGenerateSchemaRequestBodySchema,
  ioTsParsePayload,
} from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{
      schema: JSONSchema7;
    }>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST":
      const bodyRes = ioTsParsePayload(
        req.body,
        InternalPostBuilderGenerateSchemaRequestBodySchema
      );
      if (bodyRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyRes.error.join(", ")}`,
          },
        });
      }

      const model = !auth.isUpgraded()
        ? getSmallWhitelistedModel(owner)
        : getLargeWhitelistedModel(owner);
      if (!model) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `No whitelisted models were found for the workspace.`,
          },
        });
      }

      const schemaRes = await getBuilderJsonSchemaGenerator(auth, {
        instructions: bodyRes.value.instructions,
        modelId: model.modelId,
        providerId: model.providerId,
      });

      if (schemaRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error generating schema: ${JSON.stringify(
              schemaRes.error
            )}`,
          },
        });
      }

      return res.status(200).json({ schema: schemaRes.value.schema });
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

export default withSessionAuthenticationForWorkspace(handler);
