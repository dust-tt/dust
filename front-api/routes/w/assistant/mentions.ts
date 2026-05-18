import { Hono } from "hono";
import { z } from "zod";

import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";

import { validate } from "../../../middleware/validator";

const ParseMentionsRequestBodySchema = z.object({
  markdown: z.string(),
});

// Mounted under /api/w/:wId/assistant/mentions.

export const mentionsApp = new Hono();

mentionsApp.post(
  "/parse",
  validate("json", ParseMentionsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { markdown } = c.req.valid("json");

    const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });
    return c.json({ markdown: processedMarkdown });
  }
);

mentionsApp.get("/suggestions", async (c) => {
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
