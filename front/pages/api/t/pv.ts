// This endpoint must exist in both front and front-api since 
// it's used in both public homepage and app.

/** @ignoreswagger */
import { trackPageview } from "@app/lib/api/track_pageview";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getClientIp } from "@app/lib/utils/request";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ ok: boolean }>>,
  _context: { session: SessionWithUser | null }
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

  const ip =
    getClientIp({
      headers: req.headers as Record<string, string | string[] | undefined>,
      socket: req.socket,
    }) || undefined;
  const normalizedIp = ip === "internal" ? undefined : ip;

  const result = await trackPageview({
    ip: normalizedIp,
    cookieHeader: req.headers.cookie,
    userAgent: req.headers["user-agent"],
    body: req.body,
  });

  if (result.type === "rate_limited") {
    res.status(429).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
}

export default withLogging(handler);
