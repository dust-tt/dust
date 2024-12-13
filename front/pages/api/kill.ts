import type { NextApiRequest, NextApiResponse } from "next";

import type { KillSwitchType } from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";

export type GetKillSwitchesResponseBody = {
  killSwitches: KillSwitchType[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case "GET":
      const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
      return res.status(200).json({ killSwitches });
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}
