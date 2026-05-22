import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAuthors } from "@app/lib/api/assistant/editors";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import agentId from "./[aId]";
import importRoute from "./import";

export type PokeAgentConfigurationType = LightAgentConfigurationType & {
  versionAuthor?: UserType | null;
};

export type PokeGetAgentConfigurationsResponseBody = {
  agentConfigurations: PokeAgentConfigurationType[];
};

const ListAgentConfigurationsQuerySchema = z.object({
  view: z.enum(["admin_internal", "archived"]),
});

// Mounted at /api/poke/workspaces/:wId/agent_configurations.
const app = pokeApp();

app.get(
  "/",
  validate("query", ListAgentConfigurationsQuerySchema),
  async (ctx): HandlerResult<PokeGetAgentConfigurationsResponseBody> => {
    const auth = ctx.get("auth");
    const { view } = ctx.req.valid("query");

    const agentConfigurations = await getAgentConfigurationsForView({
      auth,
      agentsGetView: view,
      variant: "light",
      sort: view === "archived" ? "updatedAt" : undefined,
      dangerouslySkipPermissionFiltering: true,
    });

    const authors = await getAuthors(agentConfigurations);
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    const agentsWithAuthors: PokeAgentConfigurationType[] =
      agentConfigurations.map((a) => ({
        ...a,
        versionAuthor: a.versionAuthorId
          ? (authorMap.get(a.versionAuthorId) ?? null)
          : null,
      }));

    return ctx.json({ agentConfigurations: agentsWithAuthors });
  }
);

app.route("/import", importRoute);
app.route("/:aId", agentId);

export default app;
