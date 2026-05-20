import { Hono } from "hono";

import wId from "./[wId]";

// Note: the parent poke/index.ts already applies pokeAuth (super-user gate).
// This sub-router adds workspace resolution on top via pokeWorkspaceAuth on
// the [wId] sub-app.
const app = new Hono();

app.route("/:wId", wId);

export default app;
