import { getAuthors } from "@app/lib/api/assistant/editors";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toLightAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type {
  PokeAgentConfigurationType,
  PokeGetAgentConfigurationsResponseBody,
} from "@app/types/api/poke/agent_configurations";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import agentId from "./[aId]";
import importRoute from "./import";
import search from "./search";

const ListAgentConfigurationsQuerySchema = z.object({
  view: z.enum(["admin_internal", "archived"]),
});

// Mounted at /api/poke/workspaces/:wId/agent_configurations.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListAgentConfigurationsQuerySchema),
  async (ctx): HandlerResult<PokeGetAgentConfigurationsResponseBody> => {
    const auth = ctx.get("auth");
    const { view } = ctx.req.valid("query");

    const agents =
      view === "archived"
        ? (
            await AgentResource.listByWorkspace(auth, { status: "archived" })
          ).toSorted(
            (a, b) =>
              b.versionUpdatedAt.getTime() - a.versionUpdatedAt.getTime()
          )
        : await AgentResource.listActive(auth);
    const agentConfigurations = await toLightAgentConfigurations(auth, agents);

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
app.route("/search", search);
app.route("/:aId", agentId);

export default app;
