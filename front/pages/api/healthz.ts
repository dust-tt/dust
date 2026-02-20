import { StatsD } from "hot-shots";
import type { NextApiRequest, NextApiResponse } from "next";

export const statsDClient = new StatsD();

// TODO(2026-01-12): Delete once helm chart has been updated to use /api/healthz/ready.

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const start = performance.now();

  res.status(200).send("ok");

  const elapsed = performance.now() - start;

  statsDClient.distribution("requests.health.check", elapsed);
}
