import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type {
  CreateIncidentRequest,
  ListComponentsResponse,
  ListIncidentsResponse,
  ListPagesResponse,
  StatuspageIncident,
  UpdateIncidentRequest,
} from "@app/lib/api/actions/servers/statuspage/types";
import {
  GetIncidentResponseSchema,
  ListComponentsResponseSchema,
  ListIncidentsResponseSchema,
  ListPagesResponseSchema,
} from "@app/lib/api/actions/servers/statuspage/types";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { decrypt } from "@app/types/shared/utils/hashing";

const STATUSPAGE_API_BASE_URL = "https://api.statuspage.io/v1";

export async function getStatuspageClient(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<Result<StatuspageClient, MCPError>> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return new Err(
      new MCPError(
        "Statuspage API key not configured. Please configure a secret containing your Statuspage API key in the agent settings.",
        {
          tracked: false,
        }
      )
    );
  }

  const secret = await DustAppSecretModel.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiKey = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "Statuspage API key not found in workspace secrets. Please check the secret configuration.",
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(new StatuspageClient(apiKey));
}

export class StatuspageClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T extends z.Schema>(
    method: "GET" | "POST" | "PATCH",
    endpoint: string,
    schema: T,
    data?: unknown
  ): Promise<Result<z.infer<T>, Error>> {
    const response = await untrustedFetch(
      `${STATUSPAGE_API_BASE_URL}/${endpoint}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `OAuth ${this.apiKey}`,
        },
        body:
          data && (method === "POST" || method === "PATCH")
            ? JSON.stringify(data)
            : undefined,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Statuspage API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const rawData = await response.json();
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error(
        {
          error: parseResult.error.message,
        },
        "[Statuspage] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Statuspage API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async listPages(): Promise<Result<ListPagesResponse, Error>> {
    return this.request("GET", "pages", ListPagesResponseSchema);
  }

  async listComponents(
    pageId: string
  ): Promise<Result<ListComponentsResponse, Error>> {
    return this.request(
      "GET",
      `pages/${pageId}/components`,
      ListComponentsResponseSchema
    );
  }

  async listIncidents(
    pageId: string,
    filter: "all" | "unresolved" | "resolved" = "unresolved"
  ): Promise<Result<ListIncidentsResponse, Error>> {
    let endpoint = `pages/${pageId}/incidents`;
    if (filter === "unresolved") {
      endpoint = `pages/${pageId}/incidents/unresolved`;
    }
    // For "all" and "resolved", we use the main endpoint
    // Note: "resolved" filter would require additional filtering client-side
    // as the API doesn't have a direct "resolved" endpoint

    const result = await this.request(
      "GET",
      endpoint,
      ListIncidentsResponseSchema
    );

    if (result.isErr()) {
      return result;
    }

    // Apply client-side filtering for "resolved" incidents
    if (filter === "resolved") {
      return new Ok(
        result.value.filter((incident) => incident.status === "resolved")
      );
    }

    return result;
  }

  async getIncident(
    pageId: string,
    incidentId: string
  ): Promise<Result<StatuspageIncident, Error>> {
    return this.request(
      "GET",
      `pages/${pageId}/incidents/${incidentId}`,
      GetIncidentResponseSchema
    );
  }

  async createIncident(
    pageId: string,
    request: CreateIncidentRequest
  ): Promise<Result<StatuspageIncident, Error>> {
    // Always send notifications
    const requestWithNotifications = {
      ...request,
      incident: {
        ...request.incident,
        deliver_notifications: true,
      },
    };

    return this.request(
      "POST",
      `pages/${pageId}/incidents`,
      GetIncidentResponseSchema,
      requestWithNotifications
    );
  }

  async updateIncident(
    pageId: string,
    incidentId: string,
    request: UpdateIncidentRequest
  ): Promise<Result<StatuspageIncident, Error>> {
    // Always send notifications
    const requestWithNotifications = {
      ...request,
      incident: {
        ...request.incident,
        deliver_notifications: true,
      },
    };

    return this.request(
      "PATCH",
      `pages/${pageId}/incidents/${incidentId}`,
      GetIncidentResponseSchema,
      requestWithNotifications
    );
  }
}
