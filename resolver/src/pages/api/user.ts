import { NextApiRequest, NextApiResponse } from "next";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { apiError } from "@app/logger/withlogging";
import { RegionLookupClient } from "@app/src/lib/lookup_api";
import { WithAPIErrorResponse } from "@dust-tt/types";
import { config, isValidRegion } from "@app/src/lib/config";

const UserSearchPostBodySchema = t.type({
  email: t.string,
  email_verified: t.boolean,
  sub: t.string,
});

export type UserSearchResponseBody = {
  regionUrl: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UserSearchResponseBody>>,
) {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST requests are supported",
      },
    });
  }

  const client = new RegionLookupClient(
    config.getLookupApiSecret(),
    config.getRegionUrls(),
  );

  const bodyValidation = UserSearchPostBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const response = await client.lookupUser(bodyValidation.right);
  for (const [region, userLookupResponse] of Object.entries(response)) {
    if (userLookupResponse.user?.email && isValidRegion(region)) {
      return res.status(200).json({
        regionUrl: config.getRegionUrl(region),
      });
    }
  }

  return res.status(200).json({
    regionUrl: null,
  });
}
