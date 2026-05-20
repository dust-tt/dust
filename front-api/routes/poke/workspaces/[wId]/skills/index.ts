import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

import sId from "./[sId]";
import suggestions from "./suggestions";

export type GetPokeSkillsResponseBody = {
  skills: SkillType[];
};

// Mounted at /api/poke/workspaces/:wId/skills.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetPokeSkillsResponseBody> => {
  const auth = ctx.get("auth");

  const skills = await SkillResource.listByWorkspace(auth, {
    status: ["active", "archived", "suggested"],
  });

  return ctx.json({ skills: skills.map((skill) => skill.toJSON(auth)) });
});

// Literal segments before param segments.
app.route("/suggestions", suggestions);
app.route("/:sId", sId);

export default app;
