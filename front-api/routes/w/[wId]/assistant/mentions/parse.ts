import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const ParseMentionsRequestBodySchema = z.object({
  markdown: z.string(),
});

// Mounted at /api/w/:wId/assistant/mentions/parse.
const app = new Hono();

app.post("/", validate("json", ParseMentionsRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { markdown } = ctx.req.valid("json");

  const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });
  return ctx.json({ markdown: processedMarkdown });
});

export default app;
