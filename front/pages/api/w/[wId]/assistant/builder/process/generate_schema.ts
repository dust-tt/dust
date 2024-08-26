import type {
  ProcessSchemaPropertyType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  cloneBaseConfig,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  ioTsParsePayload,
  PROCESS_SCHEMA_ALLOWED_TYPES,
} from "@dust-tt/types";
import { InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema } from "@dust-tt/types";
import { DustProdActionRegistry } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{
      schema: ProcessSchemaPropertyType[];
    }>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST":
      const bodyRes = ioTsParsePayload(
        req.body,
        InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema
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

      const config = cloneBaseConfig(
        DustProdActionRegistry[
          "assistant-builder-process-action-schema-generator"
        ].config
      );
      config.MODEL.provider_id = model.providerId;
      config.MODEL.model_id = model.modelId;

      const actionRes = await runAction(
        auth,
        "assistant-builder-process-action-schema-generator",
        config,
        [
          {
            instructions: bodyRes.value.instructions,
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

      const rawSchema = actionRes.value.results[0][0].value as any;

      const schema: ProcessSchemaPropertyType[] = [];
      for (const key in rawSchema) {
        schema.push({
          name: key,
          type: PROCESS_SCHEMA_ALLOWED_TYPES.includes(rawSchema[key].type)
            ? rawSchema[key].type
            : "string",
          description: rawSchema[key].description || "",
        });
      }

      return res.status(200).json({ schema });
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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
