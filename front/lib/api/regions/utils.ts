import type { NextApiRequest } from "next";

import type { RegionType } from "@app/lib/api/regions/config";

export function getRegionFromRequest(req: NextApiRequest): RegionType {
  const host = req.headers.host || "";

  return host.startsWith("eu.") ? "europe-west1" : "us-central1";
}
