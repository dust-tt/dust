import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParseMentionsRequestBodySchema = z.object({
  markdown: z.string(),
});

// Mounted at /api/w/:wId/assistant/mentions/parse.
const app = workspaceApp();

/** @ignoreswagger */
app.post("/", validate("json", ParseMentionsRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { markdown } = ctx.req.valid("json");

  const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });
  return ctx.json({ markdown: processedMarkdown });
});

export default app;
