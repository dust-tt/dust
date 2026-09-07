import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

// Script-only candidate read, shared with regression tests. Both branches mirror the
// analytics loader's timestamp: terminal completion or the last persisted paused snapshot.
export async function listConsumptionAnalyticsBackfillMessages({
  afterAgentMessageModelId,
  batchSize,
  fromDate,
  toDate,
  workspace,
}: {
  afterAgentMessageModelId: number;
  batchSize: number;
  fromDate: Date;
  toDate: Date;
  workspace: LightWorkspaceType;
}) {
  return AgentMessageModel.findAll({
    attributes: ["id", "runIds"],
    where: {
      id: { [Op.gt]: afterAgentMessageModelId },
      workspaceId: workspace.id,
      [Op.or]: [
        {
          status: {
            [Op.in]: AGENT_MESSAGE_STATUSES_TO_TRACK.filter(
              isTerminalAgentMessageStatus
            ),
          },
          completedAt: { [Op.gte]: fromDate, [Op.lt]: toDate },
        },
        {
          status: "created",
          updatedAt: { [Op.gte]: fromDate, [Op.lt]: toDate },
        },
      ],
      costCredits: { [Op.ne]: null },
      runIds: { [Op.ne]: null },
    },
    include: [
      {
        model: MessageModel,
        as: "message",
        attributes: ["sId", "parentId"],
        required: true,
        where: { workspaceId: workspace.id },
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            attributes: ["sId"],
            required: true,
            where: { workspaceId: workspace.id },
          },
        ],
      },
    ],
    order: [["id", "ASC"]],
    limit: batchSize,
  });
}
