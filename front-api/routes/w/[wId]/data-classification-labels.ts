import config from "@app/lib/api/config";
import {
  getMicrosoftSensitivityLabels,
  type MicrosoftSensitivityLabel,
  parseAllowedLabelsConfig,
  type ResolveSourceErrorType,
  resolveLabelSource,
} from "@app/lib/api/data_classification_labels";
import { getFeatureFlags } from "@app/lib/auth";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import { WorkspaceSensitivityLabelConfigResource } from "@app/lib/resources/workspace_sensitivity_label_config_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

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

const SourceQuerySchema = z
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

const PostBodySchema = z
  .object({
    dataSourceId: z.string().optional(),
    internalMCPServerId: z.string().optional(),
    allowedLabels: z.array(z.string()),
  })
  .refine(
    ({ dataSourceId, internalMCPServerId }) =>
      !!dataSourceId !== !!internalMCPServerId,
    {
      message:
        "Exactly one of dataSourceId or internalMCPServerId must be provided.",
    }
  );

// Mounted at /api/w/:wId/data-classification-labels.
const app = new Hono();

app.get("/", validate("query", SourceQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You are not authorized to perform this action.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sensitivity_labels")) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The sensitivity_labels feature is not enabled.",
      },
    });
  }

  const source = ctx.req.valid("query");

  const sourceResult = await resolveLabelSource(auth, source);
  if (sourceResult.isErr()) {
    const { type, message } = sourceResult.error;
    return apiError(ctx, resolveSourceErrorToApiError(type, message));
  }

  const {
    sourceType,
    sourceId,
    connectorId: resolvedConnectorId,
    accessToken,
  } = sourceResult.value;

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
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "connector_update_error",
          message:
            "Failed to fetch Microsoft Purview sensitivity labels configuration.",
        },
      });
    }

    const parsedConfig = parseAllowedLabelsConfig(configRes.value.configValue);
    if (!parsedConfig.isValid) {
      logger.warn(
        { error: parsedConfig.error, connectorId: resolvedConnectorId },
        "Error parsing Microsoft sensitivity labels connector config"
      );
      return apiError(ctx, {
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
      logger.warn({ error: e }, "Error fetching Microsoft sensitivity labels");
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "connector_update_error",
          message: "Failed to fetch Microsoft Purview sensitivity labels.",
        },
      });
    }
  }

  return ctx.json({ labels, allowedLabels });
});

app.post("/", validate("json", PostBodySchema), async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You are not authorized to perform this action.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sensitivity_labels")) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The sensitivity_labels feature is not enabled.",
      },
    });
  }

  const body = ctx.req.valid("json");

  const sourceResult = await resolveLabelSource(auth, body);
  if (sourceResult.isErr()) {
    const { type, message } = sourceResult.error;
    return apiError(ctx, resolveSourceErrorToApiError(type, message));
  }

  const { sourceType, sourceId, connectorId: resolvedConnectorId } =
    sourceResult.value;

  const { allowedLabels } = body;

  if (sourceType === "connector") {
    if (!resolvedConnectorId) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message: "Failed to save Microsoft Purview sensitivity labels.",
          connectors_error: setConfigRes.error,
        },
      });
    }

    return ctx.json({
      config: { sourceType, sourceId, allowedLabels },
    });
  }

  const updated = await WorkspaceSensitivityLabelConfigResource.upsert(auth, {
    sourceType,
    sourceId,
    allowedLabels,
  });

  return ctx.json({ config: updated.toJSON() });
});

export default app;
