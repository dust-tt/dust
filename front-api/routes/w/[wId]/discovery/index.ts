import { workspaceApp } from "@front-api/middlewares/ctx";

import featured from "./featured";
import forYou from "./for_you";
import trending from "./trending";

// Mounted at /api/w/:wId/discovery.
const app = workspaceApp();

app.route("/featured", featured);
app.route("/for_you", forYou);
app.route("/trending", trending);

export default app;
