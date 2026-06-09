// This endpoint mirrors front-api/routes/t/pv.ts so the marketing app can
// capture server-side pageviews on its own deployment via /m/api/t/pv.

/** @ignoreswagger */
import { trackPageview } from "@marketing/lib/api/track_pageview";
import { isString } from "@marketing/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean } | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { "x-forwarded-for": forwarded } = req.headers;
  const ip = isString(forwarded)
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;

  const result = await trackPageview({
    ip,
    cookieHeader: req.headers.cookie,
    userAgent: req.headers["user-agent"],
    body: req.body ?? {},
  });

  if (result.type === "rate_limited") {
    return res.status(429).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
}
