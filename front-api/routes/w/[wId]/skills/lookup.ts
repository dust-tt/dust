import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { GetSkillsResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", z.object({ skillIds: z.array(z.string().min(1)) })),
  async (ctx): HandlerResult<GetSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { skillIds } = ctx.req.valid("json");
    // These are existing references, not discovery results. Read permission is
    // sufficient, including for editors-only skills the caller does not edit.
    const skills = await SkillResource.fetchByIds(auth, skillIds, {
      onlyActive: true,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    });

    return ctx.json({ skills: skills.map((skill) => skill.toJSON(auth)) });
  }
);

export default app;
