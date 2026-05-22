import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { workspaceApp } from "@front-api/middlewares/ctx";

// Mounted at /api/w/:wId/assistant/mentions/suggestions.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const query = ctx.req.query("query")?.trim().toLowerCase() ?? "";
  const current = ctx.req.query("current") === "true";
  const spaceId = ctx.req.query("spaceId");

  // `select` may appear multiple times in the query string. Default to both
  // agents and users when absent.
  const selectValues = ctx.req.queries("select");
  const select = !selectValues
    ? { agents: true, users: true }
    : {
        agents: selectValues.includes("agents"),
        users: selectValues.includes("users"),
      };

  const suggestions = await suggestionsOfMentions(auth, {
    query,
    select,
    current,
    spaceId,
  });

  return ctx.json({ suggestions });
});

export default app;
