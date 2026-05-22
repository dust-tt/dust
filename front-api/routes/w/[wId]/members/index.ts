import { workspaceApp } from "@front-api/middlewares/ctx";

import member from "./[uId]";
import lookup from "./lookup";
import me from "./me";
import search from "./search";

// Mounted under /api/w/:wId/members.
const app = workspaceApp();

app.route("/lookup", lookup);
app.route("/me", me);
app.route("/search", search);
app.route("/:uId", member);

export default app;
