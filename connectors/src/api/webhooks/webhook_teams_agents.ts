import { DustAPI } from "@dust-tt/client";
import type { Request, Response } from "express";

import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

/**
 * Webhook endpoint to provide Dust agents list for Teams message extensions
 */
export async function teamsAgentsWebhook(req: Request, res: Response) {
  try {
    logger.info({ method: req.method }, "Received Teams agents request");

    // For now, we'll use the first available Microsoft connector to get agents
    // In production, you might want to identify the specific workspace/connector
    const connectors = await ConnectorResource.listByType("microsoft", {});

    if (connectors.length === 0) {
      return res.status(404).json({
        error: "No Microsoft connector found",
        agents: [],
      });
    }

    const connector = connectors[0]; // Use first available connector
    if (!connector) {
      return res.status(404).json({
        error: "No Microsoft connector available",
        agents: [],
      });
    }

    // Get agents from Dust API
    const dustAPI = new DustAPI(
      { url: apiConfig.getDustFrontAPIUrl() },
      {
        workspaceId: connector.workspaceId,
        apiKey: connector.workspaceAPIKey,
      },
      logger
    );

    const agentConfigurationsRes = await dustAPI.getAgentConfigurations({});

    if (agentConfigurationsRes.isErr()) {
      logger.error(
        { error: agentConfigurationsRes.error },
        "Failed to get agent configurations"
      );
      return res.status(500).json({
        error: "Failed to get agents",
        agents: [],
      });
    }

    const activeAgents = agentConfigurationsRes.value
      .filter((ac) => ac.status === "active")
      .map((ac) => ({
        sId: ac.sId,
        name: ac.name,
        description: ac.description,
        usage: ac.usage,
      }))
      // Sort by usage (most popular first)
      .sort(
        (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
      );

    logger.info(
      { agentCount: activeAgents.length },
      "Successfully retrieved agents for Teams"
    );

    return res.status(200).json({
      agents: activeAgents,
    });
  } catch (error) {
    logger.error({ error }, "Error in Teams agents webhook");
    return res.status(500).json({
      error: "Internal server error",
      agents: [],
    });
  }
}
