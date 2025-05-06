import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdActionRegistry } from "@app/lib/registry";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema,
  ioTsParsePayload,
} from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{
      schema: Record<string, unknown>;
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
        getDustProdActionRegistry()[
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

      const schema = actionRes.value.results[0][0].value as any;
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

export default withSessionAuthenticationForWorkspace(handler);
