import { Hono } from "hono";

import lookup from "./lookup";
import search from "./search";

// Mounted under /api/w/:wId/members.
const app = new Hono();

app.route("/lookup", lookup);
app.route("/search", search);

export default app;
