import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/mentions/suggestions.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const query = c.req.query("query")?.trim().toLowerCase() ?? "";
  const current = c.req.query("current") === "true";
  const spaceId = c.req.query("spaceId");

  // `select` may appear multiple times in the query string. Default to both
  // agents and users when absent.
  const selectValues = c.req.queries("select");
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

  return c.json({ suggestions });
});

export default app;
