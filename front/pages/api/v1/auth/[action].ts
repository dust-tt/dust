import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";

type Provider = {
  authorizeUri: string;
  authenticateUri: string;
  logoutUri: string;
  clientId: string;
};

const providers: Record<string, Provider> = {
  workos: {
    authorizeUri: "api.workos.com/user_management/authorize",
    authenticateUri: "api.workos.com/user_management/authenticate",
    logoutUri: "api/workos/com/user_management/sessions/logout",
    clientId: config.getWorkOSClientId(),
  },
  auth0: {
    authorizeUri: "dust-tt.us.auth0.com/authorize",
    authenticateUri: "dust-tt.us.auth0.com/oauth/token",
    logoutUri: "dust-tt.us.auth0.com/v2/logout",
    clientId: config.getAuth0WebApplicationId(),
  },
};

function getProvider(): Provider {
  const provider = config.getOAuthProvider();
  return providers[provider];
}

/**
 * @ignoreswagger
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { action } = req.query;

  switch (action) {
    case "authorize":
      return handleAuthorize(req, res);
    case "authenticate":
      return handleAuthenticate(req, res);
    case "logout":
      return handleLogout(req, res);
    default:
      res.status(404).json({ error: "Action not found" });
  }
}

async function handleAuthorize(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req;
  const params = new URLSearchParams({
    ...query,
    client_id: getProvider().clientId,
  }).toString();
  const authorizeUrl = `https://${getProvider().authorizeUri}?${params}}`;
  res.redirect(authorizeUrl);
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await fetch(`https://${getProvider().authenticateUri}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: req.headers.origin || "",
      },
      credentials: "include",
      body: new URLSearchParams(req.body).toString(),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Error in authenticate proxy:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleLogout(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req;
  const params = new URLSearchParams({
    ...query,
    client_id: getProvider().clientId,
  }).toString();
  const authorizeUrl = `https://${getProvider().logoutUri}?${params}`;
  res.redirect(authorizeUrl);
}
