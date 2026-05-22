// This endpoint must exist in both front and front-api since
// it's used in both public homepage and app.

/** @ignoreswagger */
import { trackPageview } from "@app/lib/api/track_pageview";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError, withLogging } from "@app/logger/withlogging";
import { isString } from "@app/types/shared/utils/general";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

// TODO: Use getClientIp from @app/lib/utils/request once front uses the same Hono-based implementation as front-api.
function getClientIp(req: NextApiRequest): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  return isString(forwarded)
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;
}

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

  const ip = getClientIp(req);

  const result = await trackPageview({
    ip,
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
