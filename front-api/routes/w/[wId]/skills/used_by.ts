import { fetchSkillsUsedBy } from "@app/lib/api/skills/used_by";
import { MAX_SKILL_SEARCH_RESULTS } from "@app/lib/skill_search/query";
import type { PostSkillsUsedByResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostSkillsUsedByRequestBodySchema = z.object({
  skillIds: z.array(z.string().min(1)).min(1).max(MAX_SKILL_SEARCH_RESULTS),
});

// Mounted at /api/w/:wId/skills/used_by.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostSkillsUsedByRequestBodySchema),
  async (ctx): HandlerResult<PostSkillsUsedByResponseBody> => {
    const { skillIds } = ctx.req.valid("json");
    const usedBy = await fetchSkillsUsedBy(ctx.get("auth"), skillIds);

    return ctx.json({ usedBy });
  }
);

export default app;
