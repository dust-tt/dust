import type { IncomingMessage } from "http";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Country } from "react-phone-number-input";
import { isSupportedCountry } from "react-phone-number-input";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { resolveCountryCode } from "@app/lib/geo/country-detection";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial/index";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

const DEFAULT_COUNTRY: Country = "US";

export type GetVerifyResponseBody = {
  isEligibleForTrial: boolean;
  initialCountryCode: Country;
};

async function detectCountryFromIP(req: IncomingMessage): Promise<Country> {
  try {
    // Detect country from IP
    const { "x-forwarded-for": forwarded } = req.headers;
    const ip = isString(forwarded)
      ? forwarded.split(",")[0].trim()
      : req.socket.remoteAddress;

    if (!ip) {
      return DEFAULT_COUNTRY;
    }
    const countryCode = await resolveCountryCode(ip);
    if (isSupportedCountry(countryCode)) {
      return countryCode;
    }
    return DEFAULT_COUNTRY;
  } catch (error) {
    logger.error({ error }, "Error detecting country from IP");
    return DEFAULT_COUNTRY;
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetVerifyResponseBody | void>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can access this endpoint.",
      },
    });
  }

  const isEligibleForTrial = await isWorkspaceEligibleForTrial(auth);
  const initialCountryCode = await detectCountryFromIP(req);

  return res.status(200).json({
    isEligibleForTrial,
    initialCountryCode,
  });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
