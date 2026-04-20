/** @ignoreswagger */
import { getSensitivityLabelProviderForServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { WorkspaceSensitivityLabelConfigResource } from "@app/lib/resources/workspace_sensitivity_label_config_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MicrosoftSensitivityLabel = {
  id: string;
  name: string;
};

export type DataClassificationLabelsResponseBody = {
  labels: MicrosoftSensitivityLabel[];
  allowedLabels: MicrosoftAllowedLabel[];
};

// ─── Request schema ──────────────────────────────────────────────────────────

const SourceSchema = z.union([
  z.object({ dataSourceId: z.string(), internalMCPServerId: z.undefined() }),
  z.object({ internalMCPServerId: z.string(), dataSourceId: z.undefined() }),
]);

const PostBodySchema = z.object({
  allowedLabels: z.array(z.string()),
});

// ─── Token helpers ───────────────────────────────────────────────────────────

async function getConnectorAccessToken(
  dataSource: DataSourceResource
): Promise<string | null> {
  if (!dataSource.connectorId) {
    return null;
  }
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const connRes = await connectorsAPI.getConnector(dataSource.connectorId);
  if (connRes.isErr() || !connRes.value.connectionId) {
    return null;
  }
  const tokRes = await getOAuthConnectionAccessToken({
    config: config.getOAuthAPIConfig(),
    logger,
    connectionId: connRes.value.connectionId,
  });
  if (tokRes.isOk() && tokRes.value.access_token) {
    return tokRes.value.access_token;
  }
  return null;
}

async function getMCPConnectionAccessToken(
  auth: Authenticator,
  internalMCPServerId: string
): Promise<string | null> {
  const connsResult = await MCPServerConnectionResource.listByMCPServer(auth, {
    mcpServerId: internalMCPServerId,
  });
  if (connsResult.isErr()) {
    return null;
  }
  const conn = connsResult.value.find((c) => c.connectionType === "workspace");
  if (!conn?.connectionId) {
    return null;
  }
  const tokRes = await getOAuthConnectionAccessToken({
    config: config.getOAuthAPIConfig(),
    logger,
    connectionId: conn.connectionId,
  });
  if (tokRes.isOk() && tokRes.value.access_token) {
    return tokRes.value.access_token;
  }
  return null;
}

// ─── Microsoft helpers ───────────────────────────────────────────────────────

async function getMicrosoftSensitivityLabels(
  accessToken: string
): Promise<MicrosoftSensitivityLabel[]> {
  const client = GraphClient.init({
    authProvider: (done) => done(null, accessToken),
  });

  try {
    const res = await client
      .api("/security/dataSecurityAndGovernance/sensitivityLabels")
      .get();

    const rawLabels: { id?: string; name?: string; displayName?: string }[] =
      res?.value ?? [];

    return rawLabels
      .filter((l) => l.id)
      .map((l) => ({
        id: l.id as string,
        name: l.name ?? l.displayName ?? l.id ?? "",
      }));
  } catch (e) {
    logger.warn({ error: e }, "Error fetching Microsoft sensitivity labels");
    return [];
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      DataClassificationLabelsResponseBody | { config: unknown }
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
      const savedConfig =
        await WorkspaceSensitivityLabelConfigResource.fetchBySource(auth, {
          sourceType,
          sourceId,
        });

      const labels: MicrosoftSensitivityLabel[] = accessToken
        ? await getMicrosoftSensitivityLabels(accessToken)
        : [];

      return res.status(200).json({
        labels,
        allowedLabels: (savedConfig?.allowedLabels ??
          []) as MicrosoftAllowedLabel[],
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

      const updated = await WorkspaceSensitivityLabelConfigResource.upsert(
        auth,
        { sourceType, sourceId, allowedLabels }
      );

      return res.status(200).json({ config: updated });
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
