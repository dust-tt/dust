import { z } from "zod";

import { slackGetChannelsViaTemporal } from "./connectors/slack/client.js";
import { createSlackConnector } from "./connectors/slack/slack.js";
import { Connector } from "./lib/models.js";
import { publicProcedure, router } from "./trpc.js";

const appRouter = router({
  createSlackConnector: publicProcedure
    .input(
      z.object({
        APIKey: z.string(),
        dataSourceName: z.string(),
        workspaceId: z.string(),
        nangoConnectionId: z.string(),
      })
    )
    .mutation(async (opts): Promise<string> => {
      const { input } = opts;
      const connectorRes = await createSlackConnector(
        {
          APIKey: input.APIKey,
          dataSourceName: input.dataSourceName,
          workspaceId: input.workspaceId,
        },
        input.nangoConnectionId
      );
      if (connectorRes.isErr()) {
        throw new Error(
          `Could not create the connectors. Reason: ${connectorRes.error.message}`
        );
      }

      return connectorRes.value;
    }),
  getCannelsViaTemporalShowCaseProcedure: publicProcedure
    .input(z.string())
    .query(async (opts) => {
      const { input } = opts;
      const connector = await Connector.findByPk(input);
      if (!connector) {
        throw new Error(`Could not find the connector with id: ${input}`);
      }
      return await slackGetChannelsViaTemporal(connector.nangoConnectionId);
    }),
});

// Export type router type signature,
// NOT the router itself.
export type ClientRouterInterface = typeof appRouter;

export const serverRouter = appRouter;
