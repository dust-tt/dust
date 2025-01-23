import { StatsD } from "hot-shots";
import type { NextApiRequest, NextApiResponse } from "next";

export const statsDClient = new StatsD();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const start = performance.now();

  res.status(200).send("ok");

  const elapsed = performance.now() - start;

  statsDClient.distribution("requests.health.check", elapsed);
}
