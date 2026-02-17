import { subDays } from "date-fns";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPServerConfigurationResource } from "@app/lib/resources/agent_mcp_server_configuration_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import { makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type {
  AgentMessageAnalyticsSkillUsed,
  AgentMessageAnalyticsToolUsed,
} from "@app/types/assistant/analytics";
import type { LightWorkspaceType } from "@app/types/user";

const BATCH_SIZE = 500;

type SkillAttribution = {
  skillId: string;
  skillName: string;
};

async function backfillSkillsAnalyticsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  days: number,
  execute: boolean
) {
  const since = subDays(new Date(), days);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: since.toISOString(),
    },
    "Starting skills analytics backfill"
  );

  // Query the total count of skill records to process.
  const totalSkillRecords = await AgentMessageSkillModel.count({
    where: {
      workspaceId: workspace.id,
      createdAt: { [Op.gte]: since },
    } as WhereOptions<AgentMessageSkillModel>,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      count: totalSkillRecords,
    },
    "Found skill records to process"
  );

  if (!totalSkillRecords) {
    return;
  }

  const es = await getClient();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  let success = 0;
  let failed = 0;
  let processed = 0;
  let lastId: number | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const where: WhereOptions<AgentMessageSkillModel> = {
      workspaceId: workspace.id,
      createdAt: { [Op.gte]: since },
    };

    if (lastId !== null) {
      (where as Record<string, unknown>).id = { [Op.gt]: lastId };
    }

    // Fetch skill records with eager-loaded custom skill and MCP server configurations.
    const skillRecords = await AgentMessageSkillModel.findAll({
      where,
      include: [
        {
          model: SkillConfigurationModel,
          as: "customSkill",
          attributes: ["id", "name"],
          required: false,
          include: [
            {
              model: SkillMCPServerConfigurationModel,
              as: "mcpServerConfigurations",
              attributes: ["mcpServerViewId"],
              required: false,
            },
          ],
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          include: [
            {
              model: MessageModel,
              as: "message",
              required: true,
            },
          ],
        },
      ],
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (!skillRecords.length) {
      break;
    }

    // Group skill records by agentMessageId.
    const skillsByAgentMessageId = new Map<number, AgentMessageSkillModel[]>();
    for (const record of skillRecords) {
      const list = skillsByAgentMessageId.get(record.agentMessageId) ?? [];
      list.push(record);
      skillsByAgentMessageId.set(record.agentMessageId, list);
    }

    // Fetch global skill definitions for any global skills referenced.
    const globalSkillIds = new Set<string>();
    for (const record of skillRecords) {
      if (record.globalSkillId !== null) {
        globalSkillIds.add(record.globalSkillId);
      }
    }

    const globalSkillsMap = new Map<string, GlobalSkillDefinition>();
    if (globalSkillIds.size > 0) {
      const globalSkills = await GlobalSkillsRegistry.findAll(auth, {
        sId: Array.from(globalSkillIds),
      });
      for (const skill of globalSkills) {
        globalSkillsMap.set(skill.sId, skill);
      }
    }

    // Fetch actions for all agent messages in this batch.
    const agentMessageIds = Array.from(skillsByAgentMessageId.keys());
    const actions = await AgentMCPActionResource.listByAgentMessageIds(
      auth,
      agentMessageIds
    );

    const actionsByAgentMessageId = new Map<number, AgentMCPActionResource[]>();
    for (const action of actions) {
      const list = actionsByAgentMessageId.get(action.agentMessageId) ?? [];
      list.push(action);
      actionsByAgentMessageId.set(action.agentMessageId, list);
    }

    // Fetch MCP server configurations for tool attribution.
    const uniqueConfigIds = Array.from(
      new Set(actions.map((a) => a.mcpServerConfigurationId))
    );
    const configModelIds = uniqueConfigIds
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id) && id > 0);

    const serverConfigs =
      await AgentMCPServerConfigurationResource.fetchByModelIds(
        auth,
        configModelIds
      );

    const configIdToSId = new Map(
      serverConfigs.map((cfg) => [cfg.id.toString(), cfg.sId])
    );
    const configIdToMcpServerViewId = new Map(
      serverConfigs.map((cfg) => [cfg.id.toString(), cfg.mcpServerViewId])
    );

    const body: unknown[] = [];

    for (const [agentMessageId, msgSkillRecords] of skillsByAgentMessageId) {
      // Build skills_used array.
      const skillsUsed: AgentMessageAnalyticsSkillUsed[] = [];
      const mcpServerViewIdToSkill = new Map<string, SkillAttribution>();

      for (const record of msgSkillRecords) {
        // Custom skill case.
        if (record.customSkillId && record.customSkill) {
          const customSkill = record.customSkill;
          const skillId = makeSId("skill", {
            id: customSkill.id,
            workspaceId: workspace.id,
          });

          skillsUsed.push({
            skill_id: skillId,
            skill_name: customSkill.name,
            skill_type: "custom",
            source: record.source,
          });

          // Map all MCP server views from this skill for tool attribution.
          for (const mcpConfig of customSkill.mcpServerConfigurations ?? []) {
            mcpServerViewIdToSkill.set(mcpConfig.mcpServerViewId.toString(), {
              skillId,
              skillName: customSkill.name,
            });
          }
          continue;
        }

        // Global skill case.
        if (record.globalSkillId) {
          const globalSkill = globalSkillsMap.get(record.globalSkillId);

          skillsUsed.push({
            skill_id: record.globalSkillId,
            skill_name: globalSkill?.name ?? record.globalSkillId,
            skill_type: "global",
            source: record.source,
          });
          // Note: Global skills have internal MCP servers without mcpServerViewIds in the DB.
          // Tool attribution for global skills would require matching by internalMCPServerId.
        }
      }

      // Build tools_used array with skill attribution.
      const msgActions = actionsByAgentMessageId.get(agentMessageId) ?? [];
      const toolsUsed: AgentMessageAnalyticsToolUsed[] = msgActions.map(
        (actionResource) => {
          const mcpServerViewId = configIdToMcpServerViewId.get(
            actionResource.mcpServerConfigurationId
          );
          const skillInfo = mcpServerViewId
            ? mcpServerViewIdToSkill.get(mcpServerViewId.toString())
            : undefined;

          return {
            step_index: actionResource.stepContent.step,
            server_name:
              actionResource.metadata.internalMCPServerName ??
              actionResource.metadata.mcpServerId ??
              "unknown",
            tool_name:
              actionResource.functionCallName
                .split(TOOL_NAME_SEPARATOR)
                .pop() ?? actionResource.functionCallName,
            mcp_server_configuration_sid:
              configIdToSId.get(actionResource.mcpServerConfigurationId) ??
              undefined,
            execution_time_ms: actionResource.executionDurationMs,
            status: actionResource.status,
            skill_id: skillInfo?.skillId,
            skill_name: skillInfo?.skillName,
          };
        }
      );

      // Get the message row from one of the skill records (they all share the same agentMessage).
      // The agentMessage is eager-loaded via include but not declared on the model type.
      const skillRecord = msgSkillRecords[0] as AgentMessageSkillModel & {
        agentMessage?: AgentMessageModel & { message?: MessageModel };
      };
      const agentMessage = skillRecord.agentMessage;
      if (!agentMessage?.message) {
        continue;
      }

      const documentId = `${workspace.sId}_${agentMessage.message.sId}_${agentMessage.message.version.toString()}`;

      body.push({
        update: {
          _index: ANALYTICS_ALIAS_NAME,
          _id: documentId,
        },
      });
      body.push({
        doc: {
          skills_used: skillsUsed,
          tools_used: toolsUsed,
        },
      });
    }

    if (!body.length) {
      processed += skillRecords.length;
      lastId = skillRecords[skillRecords.length - 1].id;
      continue;
    }

    if (!execute) {
      processed += skillRecords.length;
      lastId = skillRecords[skillRecords.length - 1].id;
      logger.info(
        {
          workspaceId: workspace.sId,
          processed,
          total: totalSkillRecords,
          documentsToUpdate: body.length / 2,
        },
        "Dry run - would backfill skills analytics for this batch"
      );
      continue;
    }

    const resp = await es.bulk({
      index: ANALYTICS_ALIAS_NAME,
      body,
      refresh: false,
    });

    if (resp.errors) {
      for (const item of resp.items ?? []) {
        const update = item.update;
        if (!update || !update.error) {
          continue;
        }
        failed++;
        logger.warn(
          {
            error: update.error,
            id: update._id,
          },
          "Failed to update skills_used for analytics document"
        );
      }
    }

    success += skillRecords.length;
    processed += skillRecords.length;

    logger.info(
      {
        workspaceId: workspace.sId,
        processed,
        total: totalSkillRecords,
      },
      "Processed batch for skills analytics backfill"
    );

    lastId = skillRecords[skillRecords.length - 1].id;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      success,
      failed,
    },
    "Completed skills analytics backfill"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Run on a single workspace (optional, sId)",
    },
    days: {
      type: "number",
      demandOption: false,
      default: 30,
      description:
        "Only backfill messages created in the last N days (default: 30)",
    },
  },
  async ({ execute, workspaceId, days }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillSkillsAnalyticsForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        days,
        execute
      );
    } else {
      await runOnAllWorkspaces(
        async (ws) => {
          await backfillSkillsAnalyticsForWorkspace(ws, logger, days, execute);
        },
        { concurrency: 5 }
      );
    }
  }
);
