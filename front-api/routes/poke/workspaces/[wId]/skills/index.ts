import type { GetPokeSkillsResponseBody } from "@app/lib/api/poke/skills";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import sId from "./[sId]";
import suggestions from "./suggestions";

// Mounted at /api/poke/workspaces/:wId/skills.
const app = pokeApp();

/** @ignoreswagger */
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
