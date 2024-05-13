import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { makeScript } from "@app/scripts/helpers";

const backfillActionsStep = async (execute: boolean) => {
  const tables = [
    AgentRetrievalAction,
    AgentDustAppRunAction,
    AgentTablesQueryAction,
    AgentProcessAction,
  ];
  if (execute) {
    for (const table of tables) {
      // @ts-expect-error step is null in the table definition (sequelize init() function)
      // but not at the declaration level.
      await table.update(
        {
          step: 0,
        },
        {
          where: {
            step: null,
          },
        }
      );
    }
  }
};

makeScript({}, async ({ execute }) => {
  await backfillActionsStep(execute);
});
