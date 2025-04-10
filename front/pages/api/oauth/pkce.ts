import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isValidSalesforceDomain } from "@app/types";

type PKCEResponse = {
  code_verifier: string;
  code_challenge: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PKCEResponse>>,
  session: SessionWithUser
) {
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  const domain = req.query.domain as string;

  if (!isValidSalesforceDomain(domain)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The domain must be a valid Salesforce domain and in https://... format",
      },
    });
  }

  if (!domain.startsWith("https://")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The domain must start with https://",
      },
    });
  }

  const response = await fetch(`${domain}/services/oauth2/pkce/generator`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const json = await response.json();
    logger.error(
      {
        error: json,
        status: response.status,
        statusText: response.statusText,
      },
      "Salesforce PKCE generator failed"
    );
    throw new Error(`Salesforce PKCE generator failed: ${response.statusText}`);
  }

  const data = await response.json();

  // Transform to match our expected format
  const pkceResponse: PKCEResponse = {
    code_verifier: data.code_verifier,
    code_challenge: data.code_challenge,
  };

  return res.status(200).json(pkceResponse);
}

export default withSessionAuthentication(handler);
