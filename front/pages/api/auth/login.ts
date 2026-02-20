import type { NextApiRequest, NextApiResponse } from "next";

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return res.redirect("/api/workos/login");
}
