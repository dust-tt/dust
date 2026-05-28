import { publicApiApp } from "@front-api/middlewares/ctx";

import heartbeat from "./heartbeat";
import register from "./register";
import requests from "./requests";
import results from "./results";

// Mounted at /api/v1/w/:wId/mcp.
const app = publicApiApp();

app.route("/heartbeat", heartbeat);
app.route("/register", register);
app.route("/requests", requests);
app.route("/results", results);

export default app;
