import _ from "lodash";
import { QueryTypes } from "sequelize";

import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentVisualizationAction } from "@app/lib/models/assistant/actions/visualization";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }) => {
  type AgentMessageToBackfill = {
    message_id: number;
    agent_message_id: number;
    agent_message_content: string;
  };
  let count = 0;
  for (;;) {
    const messagesToBackfill = (
      await frontSequelize.query<AgentMessageToBackfill>(
        `
        SELECT 
            m.id as message_id,
            am.id as agent_message_id,
            am.content as agent_message_content
        FROM 
            agent_messages am
        INNER JOIN
            messages m ON m."agentMessageId" = am.id
        LEFT JOIN
            agent_message_contents amc ON am.id = amc."agentMessageId"
        WHERE
            amc.id IS NULL 
            AND 
          am.content IS NOT NULL AND am.content != ''
        ORDER BY am.id
        LIMIT 1000
        `,
        {
          type: QueryTypes.SELECT,
        }
      )
    ).filter((m) => !!m.agent_message_content.trim());

    if (messagesToBackfill.length === 0) {
      break;
    }

    console.log(
      "\n\n------------\n",
      `Processing batch of ${messagesToBackfill.length} messages (already processed: ${count})\n`,
      "------------\n\n"
    );

    count += messagesToBackfill.length;

    const agentMessageIds = messagesToBackfill.map((m) => m.agent_message_id);

    const [
      agentRetrievalActions,
      agentDustAppRunActions,
      agentTablesQueryActions,
      agentProcessActions,
      agentWebsearchActions,
      agentBrowseActions,
      agentVisualizationActions,
    ] = await Promise.all([
      AgentRetrievalAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
      AgentDustAppRunAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
      AgentTablesQueryAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
      AgentProcessAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
      AgentWebsearchAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
      AgentBrowseAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
      AgentVisualizationAction.findAll({
        where: { agentMessageId: agentMessageIds },
      }),
    ]);

    const allActions = [
      ...agentRetrievalActions,
      ...agentDustAppRunActions,
      ...agentTablesQueryActions,
      ...agentProcessActions,
      ...agentWebsearchActions,
      ...agentBrowseActions,
      ...agentVisualizationActions,
    ];

    const maxStepByAgentMessageId = _.chain(allActions)
      .groupBy("agentMessageId")
      .mapValues((actions) => _.max(actions.map((a) => a.step)))
      .value();

    const contentByAgentMessageId = _.chain(messagesToBackfill)
      .keyBy("agent_message_id")
      .mapValues("agent_message_content")
      .value();

    const updateChunks = _.chunk(agentMessageIds, 10);

    for (const toUpdate of updateChunks) {
      await Promise.all(
        toUpdate.map((id) => {
          const maxStep = maxStepByAgentMessageId[id] ?? -1;
          const content = contentByAgentMessageId[id] || "";
          if (content.trim()) {
            if (execute) {
              console.log(
                `Backfilling agent message content for agent message ${id}`
              );
              return AgentMessageContent.create({
                agentMessageId: id,
                step: maxStep + 1,
                content,
              });
            } else {
              console.log(
                `Would backfill agent message content for agent message ${id}`
              );
            }
          }
        })
      );
    }
  }
});
