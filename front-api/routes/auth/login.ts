import { Hono } from "hono";

export const loginApp = new Hono();

loginApp.get("/", (c) => c.redirect("/api/workos/login"));
