// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import {
  type DataClassificationLabelsResponseBody,
  getMicrosoftSensitivityLabels,
  type MicrosoftSensitivityLabel,
  parseAllowedLabelsConfig,
  type ResolveSourceErrorType,
  resolveLabelSource,
} from "@app/lib/api/data_classification_labels";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import type { WorkspaceSensitivityLabelConfigType } from "@app/lib/resources/workspace_sensitivity_label_config_resource";
import { WorkspaceSensitivityLabelConfigResource } from "@app/lib/resources/workspace_sensitivity_label_config_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const MICROSOFT_SENSITIVITY_LABELS_CONFIG_KEY =
  "microsoftSensitivityLabelsToInclude";

function resolveSourceErrorToApiError(
  errorType: ResolveSourceErrorType,
  message: string
) {
  switch (errorType) {
    case "data_source_not_found":
      return {
        status_code: 404 as const,
        api_error: { type: "data_source_not_found" as const, message },
      };
    case "not_microsoft_connector":
    case "unsupported_mcp_server":
      return {
        status_code: 400 as const,
        api_error: { type: "invalid_request_error" as const, message },
      };
    default:
      assertNever(errorType);
  }
}

// Re-exported so existing consumers (`components/shared/labels/types.ts`)
// keep importing from the route file.
export type { MicrosoftSensitivityLabel };

const SourceSchema = z
  .object({
    dataSourceId: z.string().optional(),
    internalMCPServerId: z.string().optional(),
  })
  .refine(
    ({ dataSourceId, internalMCPServerId }) =>
      !!dataSourceId !== !!internalMCPServerId,
    {
      message:
        "Exactly one of dataSourceId or internalMCPServerId must be provided.",
    }
  );

const PostBodySchema = z.object({
  allowedLabels: z.array(z.string()),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | DataClassificationLabelsResponseBody
      | { config: WorkspaceSensitivityLabelConfigType }
    >
  >,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You are not authorized to perform this action.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sensitivity_labels")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The sensitivity_labels feature is not enabled.",
      },
    });
  }

  const rawSource = req.method === "GET" ? req.query : req.body;
  const sourceValidation = SourceSchema.safeParse(rawSource);
  if (!sourceValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(sourceValidation.error).toString(),
      },
    });
  }

  const sourceResult = await resolveLabelSource(auth, sourceValidation.data);
  if (sourceResult.isErr()) {
    const { type, message } = sourceResult.error;
    return apiError(req, res, resolveSourceErrorToApiError(type, message));
  }

  const {
    sourceType,
    sourceId,
    connectorId: resolvedConnectorId,
    accessToken,
  } = sourceResult.value;

  // ── Handle request methods ────────────────────────────────────────────────

  switch (req.method) {
    case "GET": {
      let allowedLabels: MicrosoftAllowedLabel[] = [];
      if (sourceType === "connector" && resolvedConnectorId) {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const configRes = await connectorsAPI.getConnectorConfig(
          resolvedConnectorId,
          MICROSOFT_SENSITIVITY_LABELS_CONFIG_KEY
        );
        if (configRes.isErr()) {
          logger.warn(
            { error: configRes.error, connectorId: resolvedConnectorId },
            "Error fetching Microsoft sensitivity labels connector config"
          );
          return apiError(req, res, {
            status_code: 502,
            api_error: {
              type: "connector_update_error",
              message:
                "Failed to fetch Microsoft Purview sensitivity labels configuration.",
            },
          });
        }

        const parsedConfig = parseAllowedLabelsConfig(
          configRes.value.configValue
        );
        if (!parsedConfig.isValid) {
          logger.warn(
            { error: parsedConfig.error, connectorId: resolvedConnectorId },
            "Error parsing Microsoft sensitivity labels connector config"
          );
          return apiError(req, res, {
            status_code: 502,
            api_error: {
              type: "connector_update_error",
              message:
                "Failed to fetch Microsoft Purview sensitivity labels configuration.",
            },
          });
        }

        allowedLabels = parsedConfig.allowedLabels;
      } else if (sourceType === "mcp_connection") {
        const savedConfig =
          await WorkspaceSensitivityLabelConfigResource.fetchBySource(auth, {
            sourceType,
            sourceId,
          });
        allowedLabels = savedConfig?.allowedLabels ?? [];
      }

      let labels: MicrosoftSensitivityLabel[] = [];
      if (accessToken) {
        try {
          labels = await getMicrosoftSensitivityLabels(accessToken);
        } catch (e) {
          logger.warn(
            { error: e },
            "Error fetching Microsoft sensitivity labels"
          );
          return apiError(req, res, {
            status_code: 502,
            api_error: {
              type: "connector_update_error",
              message: "Failed to fetch Microsoft Purview sensitivity labels.",
            },
          });
        }
      }

      return res.status(200).json({
        labels,
        allowedLabels,
      });
    }

    case "POST": {
      const postValidation = PostBodySchema.safeParse(req.body);
      if (!postValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(postValidation.error).toString(),
          },
        });
      }
      const { allowedLabels } = postValidation.data;

      if (sourceType === "connector") {
        if (!resolvedConnectorId) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "data_source_not_found",
              message: "No connector found for the data source.",
            },
          });
        }

        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const setConfigRes = await connectorsAPI.setConnectorConfig(
          resolvedConnectorId,
          MICROSOFT_SENSITIVITY_LABELS_CONFIG_KEY,
          allowedLabels.length > 0 ? JSON.stringify(allowedLabels) : ""
        );
        if (setConfigRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "data_source_error",
              message: "Failed to save Microsoft Purview sensitivity labels.",
              connectors_error: setConfigRes.error,
            },
          });
        }

        return res.status(200).json({
          config: { sourceType, sourceId, allowedLabels },
        });
      }

      const updated = await WorkspaceSensitivityLabelConfigResource.upsert(
        auth,
        { sourceType, sourceId, allowedLabels }
      );

      return res.status(200).json({ config: updated.toJSON() });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
