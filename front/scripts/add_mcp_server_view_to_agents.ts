import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { makeScript } from "@app/scripts/helpers";
import assert from "assert";
import fs from "fs";
import { Op } from "sequelize";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "The workspace sId",
    },
    mcpServerViewId: {
      type: "string",
      demandOption: true,
      description: "The MCP server view sId to add to each agent",
    },
    file: {
      type: "string",
      demandOption: true,
      description: "Path to a file containing one agent name per line",
    },
  },
  async ({ workspaceId, mcpServerViewId, file, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    const view = await MCPServerViewResource.fetchById(auth, mcpServerViewId);
    assert(view, `MCP server view not found: ${mcpServerViewId}`);

    const agentNames = fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    logger.info(
      {
        mcpServerViewId,
        mcpServerViewModelId: view.id,
        agentCount: agentNames.length,
      },
      "Starting"
    );

    // Resolve each name to the latest active agent configuration version.
    const activeAgents = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        status: "active",
        name: { [Op.in]: agentNames },
      },
      attributes: ["id", "sId", "name", "version"],
    });

    // Multiple active rows per sId can exist transiently; pick the highest version per sId.
    const latestBySId = new Map<string, AgentConfigurationModel>();
    for (const a of activeAgents) {
      const existing = latestBySId.get(a.sId);
      if (!existing || a.version > existing.version) {
        latestBySId.set(a.sId, a);
      }
    }

    // Group resolved agents by name (names are not necessarily unique).
    const byName = new Map<string, AgentConfigurationModel[]>();
    for (const a of latestBySId.values()) {
      const list = byName.get(a.name) ?? [];
      list.push(a);
      byName.set(a.name, list);
    }

    let added = 0;
    let alreadyHad = 0;
    let notFound = 0;
    let ambiguous = 0;

    for (const agentName of agentNames) {
      const matches = byName.get(agentName) ?? [];

      if (matches.length === 0) {
        logger.warn({ agentName }, "Agent not found; skipping");
        notFound++;
        continue;
      }

      if (matches.length > 1) {
        logger.error(
          { agentName, matchCount: matches.length },
          "Multiple active agents with this name; skipping"
        );
        ambiguous++;
        continue;
      }

      const agent = matches[0];

      const existing = await AgentMCPServerConfigurationModel.findOne({
        where: {
          workspaceId: workspaceModelId,
          agentConfigurationId: agent.id,
          mcpServerViewId: view.id,
        },
      });
      if (existing) {
        logger.info(
          { agentName, agentSId: agent.sId },
          "Agent already has this MCP server view; skipping"
        );
        alreadyHad++;
        continue;
      }

      if (!execute) {
        logger.info(
          { agentName, agentSId: agent.sId },
          "Would add MCP server view to agent"
        );
        continue;
      }

      const created = await AgentMCPServerConfigurationModel.create({
        sId: generateRandomModelSId(),
        workspaceId: workspaceModelId,
        agentConfigurationId: agent.id,
        mcpServerViewId: view.id,
        internalMCPServerId: view.internalMCPServerId,
        additionalConfiguration: {},
        timeFrame: null,
        jsonSchema: null,
        name: null,
        singleToolDescriptionOverride: null,
        appId: null,
        secretName: null,
      });

      logger.info(
        { agentName, agentSId: agent.sId, configSId: created.sId },
        "Added MCP server view to agent"
      );
      added++;
    }

    logger.info(
      {
        total: agentNames.length,
        added,
        alreadyHad,
        notFound,
        ambiguous,
      },
      execute ? "Done" : "Dry run complete"
    );
  }
);
