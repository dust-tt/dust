import { Hono } from "hono";

import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";

export const killApp = new Hono();

killApp.get("/", async (c) => {
  const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
  return c.json({ killSwitches });
});
