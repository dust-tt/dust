import { subDays } from "date-fns";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import { makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { AgentMessageAnalyticsSkillUsed } from "@app/types/assistant/analytics";
import type { LightWorkspaceType } from "@app/types/user";

const BATCH_SIZE = 500;

function buildSkillUsedEntry(
  record: AgentMessageSkillModel,
  workspace: LightWorkspaceType,
  globalSkillsMap: Map<string, GlobalSkillDefinition>
): AgentMessageAnalyticsSkillUsed | null {
  if (record.customSkillId && record.customSkill) {
    return {
      skill_id: makeSId("skill", {
        id: record.customSkill.id,
        workspaceId: workspace.id,
      }),
      skill_name: record.customSkill.name,
      skill_type: "custom",
      source: record.source,
    };
  }

  if (record.globalSkillId) {
    const globalSkill = globalSkillsMap.get(record.globalSkillId);
    return {
      skill_id: record.globalSkillId,
      skill_name: globalSkill?.name ?? record.globalSkillId,
      skill_type: "global",
      source: record.source,
    };
  }

  return null;
}

async function backfillSkillsAnalyticsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  days: number,
  execute: boolean
): Promise<void> {
  const since = subDays(new Date(), days);
  const baseWhere = {
    workspaceId: workspace.id,
    createdAt: { [Op.gte]: since },
  };

  logger.info(
    { workspaceId: workspace.sId, since: since.toISOString() },
    "Starting skills analytics backfill"
  );

  const totalSkillRecords = await AgentMessageSkillModel.count({
    where: baseWhere,
  });

  logger.info(
    { workspaceId: workspace.sId, count: totalSkillRecords },
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
    const where: WhereOptions<AgentMessageSkillModel> =
      lastId !== null ? { ...baseWhere, id: { [Op.gt]: lastId } } : baseWhere;

    const skillRecords: AgentMessageSkillModel[] =
      await AgentMessageSkillModel.findAll({
        where,
        include: [
          {
            model: SkillConfigurationModel,
            as: "customSkill",
            attributes: ["id", "name"],
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: true,
            include: [{ model: MessageModel, as: "message", required: true }],
          },
        ],
        order: [["id", "ASC"]],
        limit: BATCH_SIZE,
      });

    if (!skillRecords.length) {
      break;
    }

    lastId = skillRecords[skillRecords.length - 1].id;
    processed += skillRecords.length;

    // Group skill records by agentMessageId.
    const skillsByAgentMessageId = new Map<number, AgentMessageSkillModel[]>();
    for (const record of skillRecords) {
      const list = skillsByAgentMessageId.get(record.agentMessageId) ?? [];
      list.push(record);
      skillsByAgentMessageId.set(record.agentMessageId, list);
    }

    // Fetch global skill definitions for referenced global skills.
    const globalSkillIds: string[] = [
      ...new Set(
        skillRecords
          .map((r) => r.globalSkillId)
          .filter((id): id is string => id !== null)
      ),
    ];

    const globalSkillsMap = new Map<string, GlobalSkillDefinition>();
    if (globalSkillIds.length > 0) {
      const globalSkills = await GlobalSkillsRegistry.findAll(auth, {
        sId: globalSkillIds,
      });
      for (const skill of globalSkills) {
        globalSkillsMap.set(skill.sId, skill);
      }
    }

    const body: unknown[] = [];

    for (const [, msgSkillRecords] of skillsByAgentMessageId) {
      const skillsUsed = msgSkillRecords
        .map((r) => buildSkillUsedEntry(r, workspace, globalSkillsMap))
        .filter((s): s is AgentMessageAnalyticsSkillUsed => s !== null);

      // The agentMessage is eager-loaded via include but not declared on
      // the model type.
      const firstRecord = msgSkillRecords[0] as AgentMessageSkillModel & {
        agentMessage?: AgentMessageModel & { message?: MessageModel };
      };
      const message = firstRecord.agentMessage?.message;
      if (!message) {
        continue;
      }

      const documentId = `${workspace.sId}_${message.sId}_${message.version}`;

      body.push({
        update: { _index: ANALYTICS_ALIAS_NAME, _id: documentId },
      });
      body.push({ doc: { skills_used: skillsUsed } });
    }

    if (!body.length) {
      continue;
    }

    if (!execute) {
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
        if (!item.update?.error) {
          continue;
        }
        failed++;
        logger.warn(
          { error: item.update.error, id: item.update._id },
          "Failed to update skills_used for analytics document"
        );
      }
    }

    success += skillRecords.length;

    logger.info(
      { workspaceId: workspace.sId, processed, total: totalSkillRecords },
      "Processed batch for skills analytics backfill"
    );
  }

  logger.info(
    { workspaceId: workspace.sId, success, failed },
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
