import { getSensitivityLabelProviderForServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type MicrosoftSensitivityLabel = {
  id: string;
  name: string;
};

const AllowedLabelsConfigSchema = z.array(z.string());

export function parseAllowedLabelsConfig(
  configValue: string | null
):
  | { isValid: true; allowedLabels: MicrosoftAllowedLabel[] }
  | { isValid: false; error: unknown } {
  if (!configValue || configValue.trim() === "") {
    return { isValid: true, allowedLabels: [] };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(configValue);
  } catch (error) {
    return { isValid: false, error };
  }

  const parsed = AllowedLabelsConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { isValid: false, error: fromError(parsed.error) };
  }

  return { isValid: true, allowedLabels: parsed.data };
}

export async function getConnectorAccessToken(
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

export async function getInternalMCPServerAccessToken(
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

export type ResolveSourceErrorType =
  | "data_source_not_found"
  | "not_microsoft_connector"
  | "unsupported_mcp_server";

export type ResolvedLabelSourceError = {
  type: ResolveSourceErrorType;
  message: string;
};

export type ResolvedLabelSource =
  | {
      sourceType: "connector";
      sourceId: string;
      connectorId: string | null;
      accessToken: string | null;
    }
  | {
      sourceType: "mcp_connection";
      sourceId: string;
      connectorId: null;
      accessToken: string | null;
    };

export async function resolveLabelSource(
  auth: Authenticator,
  source: { dataSourceId?: string; internalMCPServerId?: string }
): Promise<Result<ResolvedLabelSource, ResolvedLabelSourceError>> {
  const { dataSourceId, internalMCPServerId } = source;

  if (dataSourceId) {
    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return new Err({
        type: "data_source_not_found",
        message: "The data source was not found.",
      });
    }

    if (dataSource.connectorProvider !== "microsoft") {
      return new Err({
        type: "not_microsoft_connector",
        message:
          "Data classification labels are only supported for Microsoft connectors.",
      });
    }

    const accessToken = await getConnectorAccessToken(dataSource);
    if (!accessToken) {
      logger.warn(
        { dataSourceId },
        "No access token for connector label fetch"
      );
    }

    return new Ok({
      sourceType: "connector",
      sourceId: dataSource.sId,
      connectorId: dataSource.connectorId ?? null,
      accessToken,
    });
  }

  // MCP connection path.
  if (!internalMCPServerId) {
    return new Err({
      type: "unsupported_mcp_server",
      message: "No data source or MCP server ID provided.",
    });
  }

  const resolvedProvider =
    getSensitivityLabelProviderForServerId(internalMCPServerId);

  if (!resolvedProvider) {
    return new Err({
      type: "unsupported_mcp_server",
      message: `Unsupported MCP server for data classification: ${internalMCPServerId}`,
    });
  }

  const accessToken = await getInternalMCPServerAccessToken(
    auth,
    internalMCPServerId
  );
  if (!accessToken) {
    logger.warn(
      { internalMCPServerId },
      "No access token for MCP connection label fetch"
    );
  }

  return new Ok({
    sourceType: "mcp_connection",
    sourceId: internalMCPServerId,
    connectorId: null,
    accessToken,
  });
}

export async function getMicrosoftSensitivityLabels(
  accessToken: string
): Promise<MicrosoftSensitivityLabel[]> {
  const client = GraphClient.init({
    authProvider: (done) => done(null, accessToken),
  });

  const res = await client
    .api("/security/dataSecurityAndGovernance/sensitivityLabels")
    .get();

  const rawLabels: { id?: string; name?: string; displayName?: string }[] =
    res?.value ?? [];

  return rawLabels
    .filter((l): l is typeof l & { id: string } => !!l.id)
    .map((l) => ({
      id: l.id,
      name: l.name ?? l.displayName ?? l.id,
    }));
}
