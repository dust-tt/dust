import { skillApp } from "@front-api/middlewares/ctx";
import { withSkill } from "@front-api/middlewares/with_skill";

import suggestions from "./suggestions";

// Mounted under /api/w/:wId/assistant/skills/:sId. Resolves :sId into a
// SkillResource and enforces canWrite; everything below this directory
// inherits the `skill` context variable.
const app = skillApp();

app.use("*", withSkill);

app.route("/suggestions", suggestions);

export default app;
