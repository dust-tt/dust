import { Hono } from "hono";

import suggestionId from "./[suggestionId]";

const app = new Hono();

app.route("/:suggestionId", suggestionId);

export default app;
