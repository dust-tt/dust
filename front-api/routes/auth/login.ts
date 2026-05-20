import { Hono } from "hono";

export const loginApp = new Hono();

// Default Hono redirect is 302; Next's res.redirect() defaults to 307. Match.
loginApp.get("/", (ctx) => ctx.redirect("/api/workos/login", 307));
