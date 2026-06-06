import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { GetSuggestionsResponseBody } from "@app/lib/api/assistant/tag_manager";
import { getWorkspaceTagSuggestions } from "@app/lib/api/assistant/tag_manager";
import { removeNulls } from "@app/types/shared/utils/general";
import { isAdmin } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

const DEFAULT_SUGGESTIONS = [
  "Writing",
  "Planning",
  "Sales",
  "Support",
  "Marketing",
  "Research",
  "Analysis",
  "Development",
  "Finance",
  "HR",
  "Operations",
  "Design",
  "Strategy",
  "Training",
  "Compliance",
  "Procurement",
  "Security",
  "Legal",
  "Quality",
  "Product",
];

// Mounted at /api/w/:wId/tags/suggest_from_agents.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetSuggestionsResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!isAdmin(owner)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "not_authenticated",
        message: "You are not authorized to access this resource.",
      },
    });
  }

  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "extra_light",
  });

  const formattedAgents = agents
    .filter((a) => a.scope !== "global")
    .map(
      (a) =>
        `Identifier: ${a.sId}\nName: ${a.name}\nDescription: ${a.description?.substring(0, 200).replaceAll("\n", " ")}\nInstructions: ${a.instructions?.substring(0, 200).replaceAll("\n", " ")}`
    )
    .join("\n\n");

  if (formattedAgents.length === 0) {
    return ctx.json({
      suggestions: DEFAULT_SUGGESTIONS.map((s) => ({
        name: s,
        agents: [],
      })),
    });
  }

  const suggestionsResponse = await getWorkspaceTagSuggestions(auth, {
    formattedAgents,
  });

  if (suggestionsResponse.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: suggestionsResponse.error.message,
      },
    });
  }

  const agentsBySId = new Map(agents.map((a) => [a.sId, a]));
  const suggestions = suggestionsResponse.value.suggestions?.map((s) => ({
    name: s.name,
    agents: removeNulls(s.agentIds.map((id) => agentsBySId.get(id) ?? null)),
  }));

  return ctx.json({ suggestions });
});

export default app;
