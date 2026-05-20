import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { Hono } from "hono";

import sId from "./[sId]";
import suggestions from "./suggestions";

export type GetPokeSkillsResponseBody = {
  skills: SkillType[];
};

// Mounted at /api/poke/workspaces/:wId/skills.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const skills = await SkillResource.listByWorkspace(auth, {
    status: ["active", "archived", "suggested"],
  });

  const body: GetPokeSkillsResponseBody = {
    skills: skills.map((skill) => skill.toJSON(auth)),
  };
  return ctx.json(body);
});

// Literal segments before param segments.
app.route("/suggestions", suggestions);
app.route("/:sId", sId);

export default app;
