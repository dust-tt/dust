import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { Hono } from "hono";

export const killApp = new Hono();

killApp.get("/", async (c) => {
  const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
  return c.json({ killSwitches });
});
