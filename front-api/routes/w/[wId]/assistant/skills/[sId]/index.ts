import { skillApp } from "@front-api/middlewares/ctx";
import { withSkill } from "@front-api/middlewares/with_skill";

import preview from "./preview";
import suggestions from "./suggestions";

// Mounted under /api/w/:wId/assistant/skills/:sId. Resolves :sId into a
// SkillResource and enforces `auth.can("admin", skill)`; everything below this directory
// inherits the `skill` context variable.
const app = skillApp();

app.use("*", withSkill);

app.route("/preview", preview);
app.route("/suggestions", suggestions);

export default app;
