import { getStatsDClient } from "@app/lib/utils/statsd";
import type { NextApiRequest, NextApiResponse } from "next";

// TODO(2026-01-12): Delete once helm chart has been updated to use /api/healthz/ready.

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const start = performance.now();

  res.status(200).send("ok");

  const elapsed = performance.now() - start;

  getStatsDClient().distribution("requests.health.check", elapsed);
}
