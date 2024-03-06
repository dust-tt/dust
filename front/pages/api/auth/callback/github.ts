import type { NextApiRequest, NextApiResponse } from "next";

import { withLogging } from "@app/logger/withlogging";

// The GitHub OAuth app only allows a single Authorization callback URL.
// This redirect is required during the transition to Auth0, as we deprecate the existing logic.
// It will be removed once the GitHub configuration is updated to reflect the new callback URL.
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  res.writeHead(302, {
    Location: `${process.env.AUTH0_ISSUER_BASE_URL}/login/callback`,
  });
  res.end();
}

export default withLogging(handler);
