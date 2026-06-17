import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";

export const killApp = sessionApp();

killApp.use("*", sessionAuth);

killApp.get("/", async (ctx) => {
  const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
  return ctx.json({ killSwitches });
});
