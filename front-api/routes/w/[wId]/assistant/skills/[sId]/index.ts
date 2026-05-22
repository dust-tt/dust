import { workspaceAuthWithSkillApp } from "@front-api/middleware/env";
import { withSkill } from "@front-api/middleware/with_skill";

import suggestions from "./suggestions";

// Mounted under /api/w/:wId/assistant/skills/:sId. Resolves :sId into a
// SkillResource and enforces canWrite; everything below this directory
// inherits the `skill` context variable.
const app = workspaceAuthWithSkillApp();

app.use("*", withSkill);

app.route("/suggestions", suggestions);

export default app;
