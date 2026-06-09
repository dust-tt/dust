import { createHono } from "@front-api/lib/hono";

export const loginApp = createHono();

// Default Hono redirect is 302; Next's res.redirect() defaults to 307. Match.
loginApp.get("/", (ctx) => ctx.redirect("/api/workos/login", 307));
