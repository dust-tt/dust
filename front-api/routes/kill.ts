import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { createHono } from "@front-api/lib/hono";

export const killApp = createHono();

killApp.get("/", async (ctx) => {
  const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
  return ctx.json({ killSwitches });
});
