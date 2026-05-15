// @migration-status: MIGRATED_TO_HONO
// @migration-target: front-api/routes/auth/login.ts

/** @ignoreswagger */
import type { NextApiRequest, NextApiResponse } from "next";

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return res.redirect("/api/workos/login");
}
