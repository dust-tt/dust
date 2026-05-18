/** @ignoreswagger */
import { getSensitivityLabelProviderForServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import {
  getConnectorAccessToken,
  getMCPConnectionAccessToken,
  getMicrosoftSensitivityLabels,
  type MicrosoftSensitivityLabel,
  parseAllowedLabelsConfig,
} from "@app/lib/api/data_classification_labels";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { WorkspaceSensitivityLabelConfigType } from "@app/lib/resources/workspace_sensitivity_label_config_resource";
import { WorkspaceSensitivityLabelConfigResource } from "@app/lib/resources/workspace_sensitivity_label_config_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const MICROSOFT_SENSITIVITY_LABELS_CONFIG_KEY =
  "microsoftSensitivityLabelsToInclude";

// Re-exported so existing consumers (`components/shared/labels/types.ts`)
// keep importing from the route file.
export type { MicrosoftSensitivityLabel };

export type DataClassificationLabelsResponseBody = {
  labels: MicrosoftSensitivityLabel[];
  allowedLabels: MicrosoftAllowedLabel[];
};

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
  const { dataSourceId, internalMCPServerId } = sourceValidation.data;

  // ── Resolve sourceType, sourceId, and access token ───────────────

  let sourceType: "connector" | "mcp_connection";
  let sourceId: string;
  let accessToken: string | null;
  let resolvedConnectorId: string | null = null;

  if (dataSourceId) {
    // Connector path.
    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source was not found.",
        },
      });
    }

    if (dataSource.connectorProvider !== "microsoft") {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Data classification labels are only supported for Microsoft connectors.",
        },
      });
    }

    sourceType = "connector";
    sourceId = dataSource.sId;
    resolvedConnectorId = dataSource.connectorId ?? null;
    accessToken = await getConnectorAccessToken(dataSource);

    if (!accessToken) {
      logger.warn(
        { dataSourceId },
        "No access token for connector label fetch"
      );
    }
  } else {
    // MCP connection path.
    const resolvedProvider = getSensitivityLabelProviderForServerId(
      internalMCPServerId as string
    );

    if (!resolvedProvider) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unsupported MCP server for data classification: ${internalMCPServerId}`,
        },
      });
    }

    sourceType = "mcp_connection";
    sourceId = internalMCPServerId as string;
    accessToken = await getMCPConnectionAccessToken(
      auth,
      internalMCPServerId as string
    );

    if (!accessToken) {
      logger.warn(
        { internalMCPServerId },
        "No access token for MCP connection label fetch"
      );
    }
  }

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
