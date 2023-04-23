import { router, publicProcedure } from './trpc.js';
import { z } from 'zod';
import { createSlackConnector } from './connectors/slack/slack.js';

const appRouter = router({
  createSlackConnector: publicProcedure
    .input(
      z.object({
        APIKey: z.string(),
        dataSourceName: z.string(),
        workspaceId: z.string(),
        nangoConnectionId: z.string(),
      }),
    )
    .mutation(async (opts): Promise<string> => {
      const { input } = opts;
      const connectorRes = await createSlackConnector(
        {
          APIKey: input.APIKey,
          dataSourceName: input.dataSourceName,
          workspaceId: input.workspaceId,
        },
        input.nangoConnectionId,
      );
      if (connectorRes.isErr()) {
        throw new Error(
          `Could not create the connectors. Reason: ${connectorRes.error}`,
        );
      }

      return connectorRes.value;
    }),
});

// Export type router type signature,
// NOT the router itself.
export type ClientRouterInterface = typeof appRouter;

export const serverRouter = appRouter;